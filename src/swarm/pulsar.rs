use crate::models::QuantumError;
use crate::neural::vision_pipeline::{VisionMetadataForge, VisionPipeline, VisionPipelineRequest};
use serde::Serialize;
use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::thread;

const TOTAL_EPOCHS: u8 = 96;
const RESERVED_UI_CORES: usize = 2;
const DEFAULT_LIGHT_BATCH_WIDTH: usize = 1;
const DEFAULT_MEDIUM_BATCH_WIDTH: usize = 2;
const DEFAULT_HEAVY_BATCH_WIDTH: usize = 4;
const SUPPORTED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif"];

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum EpochClass {
    Control,
    Light,
    Medium,
    Heavy,
}

const HARMONIC_PATTERN: [EpochClass; 8] = [
    EpochClass::Control,
    EpochClass::Light,
    EpochClass::Medium,
    EpochClass::Light,
    EpochClass::Heavy,
    EpochClass::Light,
    EpochClass::Medium,
    EpochClass::Light,
];

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct EpochTick {
    pub index: u8,
    pub class: EpochClass,
}

#[derive(Debug, Clone)]
pub struct SwarmPulsarConfig {
    pub output_root: PathBuf,
    pub reserved_ui_cores: usize,
    pub light_batch_width: usize,
    pub medium_batch_width: usize,
    pub heavy_batch_width: usize,
    pub title_hint: Option<String>,
    pub product_family: Option<String>,
    pub bind_worker_affinity: bool,
    pub core_count_override: Option<usize>,
}

impl Default for SwarmPulsarConfig {
    fn default() -> Self {
        Self {
            output_root: PathBuf::from(r"V:\Metadata\Listings"),
            reserved_ui_cores: RESERVED_UI_CORES,
            light_batch_width: DEFAULT_LIGHT_BATCH_WIDTH,
            medium_batch_width: DEFAULT_MEDIUM_BATCH_WIDTH,
            heavy_batch_width: DEFAULT_HEAVY_BATCH_WIDTH,
            title_hint: None,
            product_family: None,
            bind_worker_affinity: true,
            core_count_override: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SwarmImageTask {
    pub source_path: PathBuf,
    pub output_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct SwarmTaskOutcome {
    pub epoch_index: u8,
    pub epoch_class: EpochClass,
    pub worker_core: usize,
    pub source_path: PathBuf,
    pub output_path: PathBuf,
    pub title: String,
    pub publish_ready: bool,
    pub tag_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct EpochDispatchReport {
    pub epoch_index: u8,
    pub epoch_class: EpochClass,
    pub dispatched: usize,
    pub completed: usize,
    pub remaining: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SwarmRunReport {
    pub reserved_ui_cores: usize,
    pub worker_budget: usize,
    pub discovered_tasks: usize,
    pub processed_tasks: usize,
    pub epoch_reports: Vec<EpochDispatchReport>,
    pub outputs: Vec<SwarmTaskOutcome>,
}

pub struct SwarmPulsarClock {
    config: SwarmPulsarConfig,
    cursor: AtomicU8,
}

impl SwarmPulsarClock {
    pub fn new(config: SwarmPulsarConfig) -> Self {
        Self {
            config,
            cursor: AtomicU8::new(0),
        }
    }

    pub fn epoch_class_for(index: u8) -> EpochClass {
        HARMONIC_PATTERN[(index as usize) % HARMONIC_PATTERN.len()]
    }

    pub fn next_epoch(&self) -> EpochTick {
        let index = self
            .cursor
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
                Some((current + 1) % TOTAL_EPOCHS)
            })
            .unwrap_or(0);
        EpochTick {
            index,
            class: Self::epoch_class_for(index),
        }
    }

    pub fn harmonic_cycle() -> Vec<EpochTick> {
        (0..TOTAL_EPOCHS)
            .map(|index| EpochTick {
                index,
                class: Self::epoch_class_for(index),
            })
            .collect()
    }

    pub fn discover_image_tasks<P: AsRef<Path>>(
        &self,
        input_dir: P,
    ) -> Result<VecDeque<SwarmImageTask>, QuantumError> {
        let input_dir = input_dir.as_ref();
        let mut image_paths = fs::read_dir(input_dir)
            .map_err(|error| {
                QuantumError::IOFailure(format!(
                    "failed to read swarm input directory {}: {error}",
                    input_dir.display()
                ))
            })?
            .filter_map(|entry| entry.ok().map(|value| value.path()))
            .filter(|path| path.is_file() && is_supported_image(path))
            .collect::<Vec<_>>();
        image_paths.sort();

        Ok(image_paths
            .into_iter()
            .map(|source_path| SwarmImageTask {
                output_path: self.output_path_for(&source_path),
                source_path,
            })
            .collect())
    }

    pub fn run_directory_pass<P: AsRef<Path>>(
        &self,
        input_dir: P,
    ) -> Result<SwarmRunReport, QuantumError> {
        let handler = VisionPipeline::default();
        self.run_directory_pass_with_handler(input_dir, &handler)
    }

    pub fn run_directory_pass_with_handler<P: AsRef<Path>, H: VisionMetadataForge + Sync>(
        &self,
        input_dir: P,
        handler: &H,
    ) -> Result<SwarmRunReport, QuantumError> {
        let mut queue = self.discover_image_tasks(input_dir)?;
        let discovered_tasks = queue.len();
        let swarm_cores = self.swarm_core_indices()?;
        let worker_budget = swarm_cores.len();
        let mut epoch_reports = Vec::with_capacity(TOTAL_EPOCHS as usize);
        let mut outputs = Vec::new();

        for _ in 0..TOTAL_EPOCHS {
            let epoch = self.next_epoch();
            let batch = self.take_epoch_chunk(&mut queue, epoch.class, worker_budget);
            if batch.is_empty() {
                epoch_reports.push(EpochDispatchReport {
                    epoch_index: epoch.index,
                    epoch_class: epoch.class,
                    dispatched: 0,
                    completed: 0,
                    remaining: queue.len(),
                });
                continue;
            }

            let completed = self.execute_epoch_batch(epoch, batch, &swarm_cores, handler)?;
            let completed_count = completed.len();
            outputs.extend(completed);
            epoch_reports.push(EpochDispatchReport {
                epoch_index: epoch.index,
                epoch_class: epoch.class,
                dispatched: completed_count,
                completed: completed_count,
                remaining: queue.len(),
            });
        }

        Ok(SwarmRunReport {
            reserved_ui_cores: self.config.reserved_ui_cores,
            worker_budget,
            discovered_tasks,
            processed_tasks: outputs.len(),
            epoch_reports,
            outputs,
        })
    }

    fn logical_core_count(&self) -> usize {
        self.config.core_count_override.unwrap_or_else(|| {
            std::thread::available_parallelism()
                .map(|parallelism| parallelism.get())
                .unwrap_or(1)
        })
    }

    fn swarm_core_indices(&self) -> Result<Vec<usize>, QuantumError> {
        let logical_cores = self.logical_core_count();
        if logical_cores <= self.config.reserved_ui_cores {
            return Err(QuantumError::CriticalFault(format!(
                "swarm pulsar requires more than {} logical cores to preserve UI pillars; detected {}",
                self.config.reserved_ui_cores, logical_cores
            )));
        }

        Ok((self.config.reserved_ui_cores..logical_cores).collect())
    }

    fn take_epoch_chunk(
        &self,
        queue: &mut VecDeque<SwarmImageTask>,
        class: EpochClass,
        worker_budget: usize,
    ) -> Vec<SwarmImageTask> {
        let target = self.batch_width_for(class, worker_budget);
        let mut chunk = Vec::with_capacity(target);
        for _ in 0..target {
            let Some(task) = queue.pop_front() else {
                break;
            };
            chunk.push(task);
        }
        chunk
    }

    fn batch_width_for(&self, class: EpochClass, worker_budget: usize) -> usize {
        let width = match class {
            EpochClass::Control => 0,
            EpochClass::Light => self.config.light_batch_width,
            EpochClass::Medium => self.config.medium_batch_width,
            EpochClass::Heavy => self.config.heavy_batch_width,
        };
        width.min(worker_budget)
    }

    fn execute_epoch_batch<H: VisionMetadataForge + Sync>(
        &self,
        epoch: EpochTick,
        batch: Vec<SwarmImageTask>,
        swarm_cores: &[usize],
        handler: &H,
    ) -> Result<Vec<SwarmTaskOutcome>, QuantumError> {
        let title_hint = self.config.title_hint.clone();
        let product_family = self.config.product_family.clone();
        let bind_worker_affinity = self.config.bind_worker_affinity;

        thread::scope(|scope| {
            let mut handles = Vec::with_capacity(batch.len());
            for (slot, task) in batch.into_iter().enumerate() {
                let worker_core = swarm_cores[slot % swarm_cores.len()];
                let title_hint = title_hint.clone();
                let product_family = product_family.clone();
                handles.push(scope.spawn(move || -> Result<SwarmTaskOutcome, QuantumError> {
                    if bind_worker_affinity {
                        crate::iris::bind_current_thread_to_core(worker_core)?;
                    }

                    let listing = handler.forge_metadata(VisionPipelineRequest {
                        image_path: task.source_path.clone(),
                        output_path: Some(task.output_path.clone()),
                        title_hint,
                        product_family,
                    })?;

                    Ok(SwarmTaskOutcome {
                        epoch_index: epoch.index,
                        epoch_class: epoch.class,
                        worker_core,
                        source_path: task.source_path,
                        output_path: task.output_path,
                        title: listing.title,
                        publish_ready: listing.publish_ready,
                        tag_count: listing.tags.len(),
                    })
                }));
            }

            let mut completed = Vec::with_capacity(handles.len());
            for handle in handles {
                let joined = handle.join().map_err(|_| {
                    QuantumError::CriticalFault(
                        "swarm pulsar worker panicked during vision dispatch".to_string(),
                    )
                })?;
                completed.push(joined?);
            }
            Ok(completed)
        })
    }

    fn output_path_for(&self, source_path: &Path) -> PathBuf {
        let stem = source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(sanitize_path_token)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "vision-task".to_string());
        self.config.output_root.join(format!("{stem}.json"))
    }
}

impl Default for SwarmPulsarClock {
    fn default() -> Self {
        Self::new(SwarmPulsarConfig::default())
    }
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            let lowered = extension.to_ascii_lowercase();
            SUPPORTED_IMAGE_EXTENSIONS
                .iter()
                .any(|expected| lowered == *expected)
        })
        .unwrap_or(false)
}

fn sanitize_path_token(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[cfg(all(test, feature = "desktop", not(target_arch = "wasm32")))]
mod tests {
    use super::{EpochClass, SwarmPulsarClock, SwarmPulsarConfig};
        use crate::models::QuantumError;
    use crate::merch_engine::{MerchListingResult, MerchVisionRecord};
    use crate::neural::vision_pipeline::{VisionMetadataForge, VisionPipelineRequest};
    use std::fs;

    struct MockVisionForge;

    impl VisionMetadataForge for MockVisionForge {
        fn forge_metadata(
            &self,
            request: VisionPipelineRequest,
        ) -> Result<MerchListingResult, QuantumError> {
            let title = request
                .image_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("mock")
                .to_string();
            Ok(MerchListingResult {
                qc_approved: true,
                publish_ready: true,
                title,
                description: "mock description".to_string(),
                tags: vec!["signal".to_string(), "merch".to_string(), "forge".to_string()],
                confidence: 0.91,
                reason_flags: Vec::new(),
                vision: MerchVisionRecord {
                    mime_type: "image/png".to_string(),
                    width: 1024,
                    height: 1024,
                    aspect_ratio: 1.0,
                    byte_length: 4,
                    filename_keywords: Vec::new(),
                },
            })
        }
    }

    #[test]
    fn harmonic_pattern_repeats_for_full_96_epoch_cycle() {
        let cycle = SwarmPulsarClock::harmonic_cycle();
        assert_eq!(cycle.len(), 96);
        assert_eq!(cycle[0].class, EpochClass::Control);
        assert_eq!(cycle[1].class, EpochClass::Light);
        assert_eq!(cycle[2].class, EpochClass::Medium);
        assert_eq!(cycle[4].class, EpochClass::Heavy);
        assert_eq!(cycle[8].class, EpochClass::Control);
        assert_eq!(cycle[95].class, EpochClass::Light);
    }

    #[test]
    fn discovers_only_supported_images() {
        let temp_dir = std::env::temp_dir().join(format!(
            "quantum-swarm-pulsar-discovery-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("temp dir");
        fs::write(temp_dir.join("a.png"), b"png").expect("png fixture");
        fs::write(temp_dir.join("b.JPG"), b"jpg").expect("jpg fixture");
        fs::write(temp_dir.join("notes.txt"), b"txt").expect("txt fixture");

        let mut config = SwarmPulsarConfig::default();
        config.output_root = temp_dir.join("out");
        config.bind_worker_affinity = false;
        config.core_count_override = Some(6);
        let clock = SwarmPulsarClock::new(config);
        let tasks = clock.discover_image_tasks(&temp_dir).expect("discover tasks");

        assert_eq!(tasks.len(), 2);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn runs_directory_pass_with_reserved_ui_core_budget() {
        let temp_dir = std::env::temp_dir().join(format!(
            "quantum-swarm-pulsar-run-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("temp dir");
        fs::write(temp_dir.join("alpha.png"), b"png").expect("alpha fixture");
        fs::write(temp_dir.join("beta.jpg"), b"jpg").expect("beta fixture");
        fs::write(temp_dir.join("gamma.gif"), b"gif").expect("gamma fixture");

        let mut config = SwarmPulsarConfig::default();
        config.output_root = temp_dir.join("out");
        config.bind_worker_affinity = false;
        config.core_count_override = Some(6);
        let clock = SwarmPulsarClock::new(config);
        let report = clock
            .run_directory_pass_with_handler(&temp_dir, &MockVisionForge)
            .expect("run directory pass");

        assert_eq!(report.reserved_ui_cores, 2);
        assert_eq!(report.worker_budget, 4);
        assert_eq!(report.discovered_tasks, 3);
        assert_eq!(report.processed_tasks, 3);
        assert_eq!(report.outputs.len(), 3);
        assert_eq!(report.epoch_reports.len(), 96);
        assert!(report.outputs.iter().all(|output| output.publish_ready));
        let _ = fs::remove_dir_all(&temp_dir);
    }
}

