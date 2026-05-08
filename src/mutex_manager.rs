use crate::models::QuantumError;
use std::path::Path;

#[cfg(not(target_os = "windows"))]
use std::sync::{Mutex, MutexGuard, OnceLock};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{
    CreateMutexW, ReleaseMutex, WaitForSingleObject, INFINITE,
};

const V_DRIVE_LETTER: char = 'V';
#[cfg(target_os = "windows")]
const WAIT_OBJECT_0_CODE: u32 = 0;
#[cfg(target_os = "windows")]
const WAIT_ABANDONED_CODE: u32 = 0x0000_0080;
#[cfg(target_os = "windows")]
const V_DRIVE_MUTEX_NAME: &str = "Local\\CommandQuantum.VDrive.WriteGate";

pub fn with_v_drive_write_lock<T, F>(target: &Path, action: F) -> Result<T, QuantumError>
where
    F: FnOnce() -> Result<T, QuantumError>,
{
    if !targets_v_drive(target) {
        return action();
    }

    let _guard = VDriveWriteGuard::acquire()?;
    action()
}

pub fn targets_v_drive(path: &Path) -> bool {
    let rendered = path.as_os_str().to_string_lossy();
    rendered
        .chars()
        .next()
        .map(|letter| letter.eq_ignore_ascii_case(&V_DRIVE_LETTER))
        .unwrap_or(false)
        && rendered.chars().nth(1) == Some(':')
}

struct VDriveWriteGuard {
    #[cfg(target_os = "windows")]
    handle: HANDLE,
    #[cfg(not(target_os = "windows"))]
    _guard: MutexGuard<'static, ()>,
}

impl VDriveWriteGuard {
    fn acquire() -> Result<Self, QuantumError> {
        #[cfg(target_os = "windows")]
        {
            let wide_name: Vec<u16> = V_DRIVE_MUTEX_NAME
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let handle = unsafe { CreateMutexW(std::ptr::null(), 0, wide_name.as_ptr()) };
            if handle.is_null() {
                return Err(QuantumError::IOFailure(format!(
                    "failed to create Tool 11 V-drive mutex: {}",
                    std::io::Error::last_os_error()
                )));
            }

            let wait = unsafe { WaitForSingleObject(handle, INFINITE) };
            if wait != WAIT_OBJECT_0_CODE && wait != WAIT_ABANDONED_CODE {
                unsafe {
                    CloseHandle(handle);
                }
                return Err(QuantumError::IOFailure(format!(
                    "failed to acquire Tool 11 V-drive mutex: wait status {}",
                    wait
                )));
            }

            Ok(Self { handle })
        }

        #[cfg(not(target_os = "windows"))]
        {
            static FALLBACK_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
            let guard = FALLBACK_MUTEX
                .get_or_init(|| Mutex::new(()))
                .lock()
                .map_err(|_| QuantumError::CriticalFault("Tool 11 fallback mutex poisoned".into()))?;
            Ok(Self { _guard: guard })
        }
    }
}

impl Drop for VDriveWriteGuard {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        unsafe {
            ReleaseMutex(self.handle);
            CloseHandle(self.handle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::targets_v_drive;
    use std::path::Path;

    #[test]
    fn detects_v_drive_targets_case_insensitively() {
        assert!(targets_v_drive(Path::new(r"V:\Archive\ColdVault.zst")));
        assert!(targets_v_drive(Path::new(r"v:\Egress\HotSwap.raw")));
        assert!(!targets_v_drive(Path::new(r"C:\Temp\ColdVault.zst")));
    }
}

