use crate::models::QuantumError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const READ_LEASE_MILLIS: u64 = 1_200;
pub const WRITE_LEASE_MILLIS: u64 = 36_000;
#[cfg(not(target_arch = "wasm32"))]
const GOVERNOR_STATE_PATH: &str = ".tmp/sensory/governor-state.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GovernorOperation {
    Read,
    Write,
}

impl GovernorOperation {
    pub fn lease_window(self) -> Duration {
        match self {
            Self::Read => Duration::from_millis(READ_LEASE_MILLIS),
            Self::Write => Duration::from_millis(WRITE_LEASE_MILLIS),
        }
    }

    pub fn lease_millis(self) -> u64 {
        self.lease_window().as_millis() as u64
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaseLedgerRecord {
    pub lane: String,
    pub operation: GovernorOperation,
    pub next_allowed_epoch_ms: u64,
    pub last_granted_epoch_ms: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct GovernorSnapshotFile {
    leases: BTreeMap<String, LeaseLedgerRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernorLeaseDecision {
    pub lane: String,
    pub operation: GovernorOperation,
    pub granted: bool,
    pub wait_millis: u64,
    pub next_allowed_epoch_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GovernorSignal {
    pub throttled: bool,
    pub fallback_signal: bool,
    pub next_clear_epoch_ms: Option<u64>,
    pub max_wait_millis: u64,
}

#[derive(Debug)]
pub struct SensoryGovernor {
    leases: RwLock<BTreeMap<String, LeaseLedgerRecord>>,
    persistence: GovernorPersistence,
}

#[allow(dead_code)]
#[derive(Debug)]
enum GovernorPersistence {
    Native { path: PathBuf },
    Volatile,
}

impl SensoryGovernor {
    pub fn new() -> Self {
        let persistence = default_persistence();
        let leases = load_lease_state(&persistence).unwrap_or_default();
        Self {
            leases: RwLock::new(leases),
            persistence,
        }
    }

    pub fn lease_provider(
        &self,
        provider_lane: &str,
        operation: GovernorOperation,
    ) -> Result<GovernorLeaseDecision, QuantumError> {
        let lane = normalize_lane(provider_lane, operation);
        let now_ms = epoch_millis();
        let mut leases = self
            .leases
            .write()
            .map_err(|_| QuantumError::Vault("sensory governor lock poisoned".into()))?;

        let current = leases.get(&lane).cloned().unwrap_or(LeaseLedgerRecord {
            lane: lane.clone(),
            operation,
            next_allowed_epoch_ms: 0,
            last_granted_epoch_ms: None,
        });

        let decision = if current.next_allowed_epoch_ms <= now_ms {
            let next_allowed_epoch_ms = now_ms.saturating_add(operation.lease_millis());
            let updated = LeaseLedgerRecord {
                lane: lane.clone(),
                operation,
                next_allowed_epoch_ms,
                last_granted_epoch_ms: Some(now_ms),
            };
            leases.insert(lane.clone(), updated);
            GovernorLeaseDecision {
                lane,
                operation,
                granted: true,
                wait_millis: 0,
                next_allowed_epoch_ms,
            }
        } else {
            GovernorLeaseDecision {
                lane,
                operation,
                granted: false,
                wait_millis: current.next_allowed_epoch_ms.saturating_sub(now_ms),
                next_allowed_epoch_ms: current.next_allowed_epoch_ms,
            }
        };

        persist_lease_state(&self.persistence, &leases)?;
        Ok(decision)
    }

    pub fn governor_signal(&self) -> GovernorSignal {
        let now_ms = epoch_millis();
        let Ok(leases) = self.leases.read() else {
            return GovernorSignal {
                throttled: true,
                fallback_signal: true,
                next_clear_epoch_ms: Some(now_ms.saturating_add(WRITE_LEASE_MILLIS)),
                max_wait_millis: WRITE_LEASE_MILLIS,
            };
        };

        let mut next_clear_epoch_ms = None;
        let mut max_wait_millis = 0;

        for record in leases.values() {
            if record.next_allowed_epoch_ms > now_ms {
                next_clear_epoch_ms = Some(
                    next_clear_epoch_ms
                        .map(|current: u64| current.max(record.next_allowed_epoch_ms))
                        .unwrap_or(record.next_allowed_epoch_ms),
                );
                max_wait_millis =
                    max_wait_millis.max(record.next_allowed_epoch_ms.saturating_sub(now_ms));
            }
        }

        GovernorSignal {
            throttled: next_clear_epoch_ms.is_some(),
            fallback_signal: next_clear_epoch_ms.is_some(),
            next_clear_epoch_ms,
            max_wait_millis,
        }
    }
}

impl Default for SensoryGovernor {
    fn default() -> Self {
        Self::new()
    }
}

fn normalize_lane(provider_lane: &str, operation: GovernorOperation) -> String {
    format!(
        "{}:{}",
        provider_lane.trim().to_ascii_lowercase(),
        operation.as_str()
    )
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn default_persistence() -> GovernorPersistence {
    #[cfg(not(target_arch = "wasm32"))]
    {
        GovernorPersistence::Native {
            path: PathBuf::from(GOVERNOR_STATE_PATH),
        }
    }

    #[cfg(target_arch = "wasm32")]
    {
        GovernorPersistence::Volatile
    }
}

fn load_lease_state(
    persistence: &GovernorPersistence,
) -> Result<BTreeMap<String, LeaseLedgerRecord>, QuantumError> {
    match persistence {
        GovernorPersistence::Native { path } => {
            let Ok(serialized) = std::fs::read_to_string(path) else {
                return Ok(BTreeMap::new());
            };
            let snapshot: GovernorSnapshotFile = serde_json::from_str(&serialized).map_err(|error| {
                QuantumError::Vault(format!(
                    "failed to decode governor state at {}: {error}",
                    path.display()
                ))
            })?;
            Ok(snapshot.leases)
        }
        GovernorPersistence::Volatile => Ok(BTreeMap::new()),
    }
}

fn persist_lease_state(
    persistence: &GovernorPersistence,
    leases: &BTreeMap<String, LeaseLedgerRecord>,
) -> Result<(), QuantumError> {
    match persistence {
        GovernorPersistence::Native { path } => {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    QuantumError::Vault(format!(
                        "failed to prepare governor state directory {}: {error}",
                        parent.display()
                    ))
                })?;
            }

            let temp_path = path.with_extension("json.tmp");
            let serialized = serde_json::to_string_pretty(&GovernorSnapshotFile {
                leases: leases.clone(),
            })
            .map_err(|error| {
                QuantumError::Vault(format!("failed to serialize governor state: {error}"))
            })?;

            std::fs::write(&temp_path, serialized).map_err(|error| {
                QuantumError::Vault(format!(
                    "failed to write governor temp state {}: {error}",
                    temp_path.display()
                ))
            })?;
            std::fs::rename(&temp_path, path).map_err(|error| {
                QuantumError::Vault(format!(
                    "failed to finalize governor state {}: {error}",
                    path.display()
                ))
            })?;
            Ok(())
        }
        GovernorPersistence::Volatile => Ok(()),
    }
}






