use crate::models::QuantumError;
use memmap2::{Mmap, MmapMut, MmapOptions};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub const HOTSWAP_BYTES: usize = 134_217_728;
pub const HOTSWAP_PAGE_BYTES: usize = 4 * 1024;
const HOTSWAP_MASK: usize = HOTSWAP_BYTES - 1;
pub const HOTSWAP_SENTINEL_BYTES: usize = 4;
const HEARTBEAT_SENTINEL_INITIAL: u32 = 1;
const FRAME_HEADER_BYTES: usize = 4;
const HOTSWAP_PATH: &str = r"V:\Egress\HotSwap.raw";
const DEFAULT_JANITOR_CLAIM_BYTES: usize = 4 * 1024 * 1024;
const USABLE_BYTES: usize = HOTSWAP_BYTES - HOTSWAP_SENTINEL_BYTES;

static EGRESS_RING: OnceLock<Arc<EgressRingBuffer>> = OnceLock::new();

pub struct JanitorClaim {
    pub bytes: Vec<u8>,
    next_tail: u64,
}

pub struct EgressRingBuffer {
    path: PathBuf,
    mmap: Mutex<MmapMut>,
    head: AtomicU64,
    tail: AtomicU64,
}

impl EgressRingBuffer {
    pub fn initialize() -> Result<Arc<Self>, QuantumError> {
        if let Some(existing) = EGRESS_RING.get() {
            return Ok(existing.clone());
        }

        let path = PathBuf::from(HOTSWAP_PATH);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                QuantumError::IOFailure(format!("failed to create HotSwap directory: {error}"))
            })?;
        }

        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(&path)
            .map_err(|error| QuantumError::IOFailure(format!("failed to open HotSwap.raw: {error}")))?;

        file.set_len(HOTSWAP_BYTES as u64)
            .map_err(|error| QuantumError::IOFailure(format!("failed to size HotSwap.raw: {error}")))?;

        let mut mmap = unsafe {
            MmapOptions::new()
                .len(HOTSWAP_BYTES)
                .map_mut(&file)
                .map_err(|error| QuantumError::IOFailure(format!("failed to mmap HotSwap.raw: {error}")))?
        };
        mmap[..HOTSWAP_SENTINEL_BYTES]
            .copy_from_slice(&HEARTBEAT_SENTINEL_INITIAL.to_le_bytes());
        mmap.flush_async()
            .map_err(|error| QuantumError::IOFailure(format!("failed to flush HotSwap sentinel: {error}")))?;

        let ring = Arc::new(Self {
            path,
            mmap: Mutex::new(mmap),
            head: AtomicU64::new(HOTSWAP_SENTINEL_BYTES as u64),
            tail: AtomicU64::new(HOTSWAP_SENTINEL_BYTES as u64),
        });
        let _ = EGRESS_RING.set(ring.clone());
        Ok(ring)
    }

    pub fn global() -> Result<Arc<Self>, QuantumError> {
        if let Some(existing) = EGRESS_RING.get() {
            return Ok(existing.clone());
        }
        Self::initialize()
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn warm_up_and_prime(&self) -> Result<u32, QuantumError> {
        let mut mmap = self
            .mmap
            .lock()
            .map_err(|_| QuantumError::CriticalFault("egress ring mmap lock poisoned".into()))?;

        let next_heartbeat = self
            .read_heartbeat_locked(&mmap)
            .saturating_add(1)
            .max(HEARTBEAT_SENTINEL_INITIAL);
        mmap[..HOTSWAP_SENTINEL_BYTES].copy_from_slice(&next_heartbeat.to_le_bytes());
        mmap.flush()
            .map_err(|error| QuantumError::IOFailure(format!("failed to flush HotSwap heartbeat prime: {error}")))?;
        Ok(next_heartbeat)
    }

    pub fn push_framed_data(&self, payload: &[u8]) -> Result<u8, QuantumError> {
        let required = FRAME_HEADER_BYTES + payload.len();
        if required >= USABLE_BYTES {
            return Err(QuantumError::IOFailure(
                "egress payload exceeds ring buffer capacity".into(),
            ));
        }

        let head = self.head.load(Ordering::Acquire);
        let tail = self.tail.load(Ordering::Acquire);
        if required > self.free_space(head, tail) {
            return Err(QuantumError::IOFailure("egress ring buffer is full".into()));
        }

        let mut mmap = self
            .mmap
            .lock()
            .map_err(|_| QuantumError::CriticalFault("egress ring mmap lock poisoned".into()))?;

        let write_ptr = self.normalize_cursor(head);
        let frame_len = (payload.len() as u32).to_le_bytes();
        unsafe {
            self.split_write(mmap.as_mut_ptr(), write_ptr, &frame_len)?;
            self.split_write(
                mmap.as_mut_ptr(),
                self.advance_cursor(write_ptr, FRAME_HEADER_BYTES),
                payload,
            )?;
        }
        mmap.flush_async()
            .map_err(|error| QuantumError::IOFailure(format!("egress mmap flush failed: {error}")))?;

        let next_head = self.advance_cursor(write_ptr, required);
        self.head.store(next_head, Ordering::Release);
        Ok(self.depth_telemetry())
    }

    pub fn claim_for_janitor(&self) -> Result<Option<JanitorClaim>, QuantumError> {
        let head = self.head.load(Ordering::Acquire);
        let mut cursor = self.normalize_cursor(self.tail.load(Ordering::Acquire));
        if cursor == self.normalize_cursor(head) {
            return Ok(None);
        }

        let mmap = self
            .mmap
            .lock()
            .map_err(|_| QuantumError::CriticalFault("egress ring mmap lock poisoned".into()))?;

        let mut claimed = Vec::new();
        let normalized_head = self.normalize_cursor(head);
        while cursor != normalized_head {
            let frame_len = self.read_frame_length(&mmap, cursor)?;
            if frame_len == 0 || frame_len > USABLE_BYTES {
                return Err(QuantumError::IOFailure("egress ring frame header was invalid".into()));
            }

            if !claimed.is_empty() && claimed.len() + frame_len + 1 > DEFAULT_JANITOR_CLAIM_BYTES {
                break;
            }

            let payload_cursor = self.advance_cursor(cursor, FRAME_HEADER_BYTES);
            self.read_frame_payload(&mmap, payload_cursor, frame_len, &mut claimed)?;
            claimed.push(b'\n');
            cursor = self.advance_cursor(payload_cursor, frame_len);
            if claimed.len() >= DEFAULT_JANITOR_CLAIM_BYTES {
                break;
            }
        }

        if claimed.is_empty() {
            return Ok(None);
        }

        Ok(Some(JanitorClaim {
            bytes: claimed,
            next_tail: cursor,
        }))
    }

    pub fn release_claim(&self, claim: JanitorClaim) {
        self.tail.store(claim.next_tail, Ordering::Release);
    }

    pub fn depth_telemetry(&self) -> u8 {
        let head = self.head.load(Ordering::Acquire);
        let tail = self.tail.load(Ordering::Acquire);
        let used = self.used_space(head, tail);
        ((used as f64 / USABLE_BYTES as f64) * 255.0)
            .round()
            .clamp(0.0, 255.0) as u8
    }

    pub fn claim_contiguous(&self, cursor: u64) -> (usize, usize) {
        let normalized = self.normalize_cursor(cursor);
        let offset = self.resolve_offset(normalized);
        let contiguous = HOTSWAP_BYTES.saturating_sub(offset);
        (offset, contiguous)
    }

    fn normalize_cursor(&self, cursor: u64) -> u64 {
        let masked = (cursor as usize) & HOTSWAP_MASK;
        if masked < HOTSWAP_SENTINEL_BYTES {
            cursor + (HOTSWAP_SENTINEL_BYTES - masked) as u64
        } else {
            cursor
        }
    }

    fn resolve_offset(&self, cursor: u64) -> usize {
        let offset = (cursor as usize) & HOTSWAP_MASK;
        if offset < HOTSWAP_SENTINEL_BYTES {
            HOTSWAP_SENTINEL_BYTES
        } else {
            offset
        }
    }

    fn advance_cursor(&self, cursor: u64, delta: usize) -> u64 {
        self.normalize_cursor(cursor.saturating_add(delta as u64))
    }

    fn used_space(&self, head: u64, tail: u64) -> usize {
        head.saturating_sub(tail) as usize
    }

    fn free_space(&self, head: u64, tail: u64) -> usize {
        USABLE_BYTES
            .saturating_sub(self.used_space(head, tail))
            .saturating_sub(1)
    }

    unsafe fn split_write(
        &self,
        base: *mut u8,
        cursor: u64,
        bytes: &[u8],
    ) -> Result<(), QuantumError> {
        let (offset, contiguous) = self.claim_contiguous(cursor);
        let suffix = bytes.len().min(contiguous);
        unsafe {
            ptr::copy_nonoverlapping(bytes.as_ptr(), base.add(offset), suffix);
        }
        if suffix < bytes.len() {
            let prefix = bytes.len() - suffix;
            unsafe {
                ptr::copy_nonoverlapping(
                    bytes.as_ptr().add(suffix),
                    base.add(HOTSWAP_SENTINEL_BYTES),
                    prefix,
                );
            }
        }
        Ok(())
    }

    fn read_frame_length(&self, mmap: &MmapMut, cursor: u64) -> Result<usize, QuantumError> {
        let mut header = [0u8; FRAME_HEADER_BYTES];
        self.read_split(mmap, cursor, &mut header)?;
        Ok(u32::from_le_bytes(header) as usize)
    }

    fn read_frame_payload(
        &self,
        mmap: &MmapMut,
        cursor: u64,
        frame_len: usize,
        out: &mut Vec<u8>,
    ) -> Result<(), QuantumError> {
        let start = out.len();
        out.resize(start + frame_len, 0);
        self.read_split(mmap, cursor, &mut out[start..start + frame_len])
    }

    fn read_split(
        &self,
        mmap: &MmapMut,
        cursor: u64,
        out: &mut [u8],
    ) -> Result<(), QuantumError> {
        let (offset, contiguous) = self.claim_contiguous(cursor);
        let suffix = out.len().min(contiguous);
        out[..suffix].copy_from_slice(&mmap[offset..offset + suffix]);
        if suffix < out.len() {
            let prefix = out.len() - suffix;
            out[suffix..].copy_from_slice(
                &mmap[HOTSWAP_SENTINEL_BYTES..(HOTSWAP_SENTINEL_BYTES + prefix)],
            );
        }
        Ok(())
    }

    fn read_heartbeat_locked(&self, mmap: &MmapMut) -> u32 {
        let mut bytes = [0u8; HOTSWAP_SENTINEL_BYTES];
        bytes.copy_from_slice(&mmap[..HOTSWAP_SENTINEL_BYTES]);
        u32::from_le_bytes(bytes)
    }
}

pub struct MmapSentinelReader {
    mmap: Mmap,
}

impl MmapSentinelReader {
    pub fn open() -> Result<Self, QuantumError> {
        let file = File::open(HOTSWAP_PATH)
            .map_err(|error| QuantumError::IOFailure(format!("failed to open HotSwap.raw for telemetry: {error}")))?;
        let mmap = unsafe {
            MmapOptions::new()
                .len(HOTSWAP_BYTES)
                .map(&file)
                .map_err(|error| QuantumError::IOFailure(format!("failed to mmap HotSwap.raw for telemetry: {error}")))?
        };
        Ok(Self { mmap })
    }

    pub fn heartbeat_alive(&self) -> bool {
        self.heartbeat_value() > 0
    }

    pub fn heartbeat_value(&self) -> u32 {
        let mut bytes = [0u8; HOTSWAP_SENTINEL_BYTES];
        bytes.copy_from_slice(&self.mmap[..HOTSWAP_SENTINEL_BYTES]);
        u32::from_le_bytes(bytes)
    }
}


