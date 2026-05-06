#[cfg(not(target_arch = "wasm32"))]
use std::env;
#[cfg(not(target_arch = "wasm32"))]
use std::ffi::OsStr;
#[cfg(not(target_arch = "wasm32"))]
use std::fs;
#[cfg(not(target_arch = "wasm32"))]
use std::io;
#[cfg(not(target_arch = "wasm32"))]
use std::path::{Path, PathBuf};
#[cfg(not(target_arch = "wasm32"))]
use std::process::{Command, Stdio};
#[cfg(not(target_arch = "wasm32"))]
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(not(target_arch = "wasm32"))]
const REPO_SLUG: &str = "SharpBizDev/MerchQuantum";
#[cfg(not(target_arch = "wasm32"))]
const DEFAULT_REMOTE: &str = "https://github.com/SharpBizDev/MerchQuantum.git";
#[cfg(not(target_arch = "wasm32"))]
const DEPLOY_AUTHOR_NAME: &str = "Quantum Forge";
#[cfg(not(target_arch = "wasm32"))]
const DEPLOY_AUTHOR_EMAIL: &str = "quantum-forge@users.noreply.github.com";

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Clone)]
pub struct DeployTarget {
    pub branch: &'static str,
    pub source_path: PathBuf,
    pub commit_message: &'static str,
}

#[cfg(not(target_arch = "wasm32"))]
pub fn run() -> Result<(), String> {
    let repo_root = resolve_repo_root()?;
    let targets = vec![
        DeployTarget {
            branch: "feature/quantum-refinery-core",
            source_path: repo_root.join(".tmp").join("worktrees").join("mq-detached-refactor"),
            commit_message: "chore: sync quantum refinery core",
        },
        DeployTarget {
            branch: "feature/quantum-sensory-core",
            source_path: repo_root.join(".tmp").join("worktrees").join("rust-sensory-core"),
            commit_message: "chore: sync quantum sensory core",
        },
    ];

    let auth = GitAuth::discover()?;
    let remote = auth.authenticated_remote(DEFAULT_REMOTE)?;

    for target in targets {
        deploy_target(&remote, &auth, &target)?;
    }

    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn resolve_repo_root() -> Result<PathBuf, String> {
    let current = env::current_dir().map_err(|err| format!("current_dir failed: {err}"))?;
    current
        .ancestors()
        .find(|path| path.join(".tmp").join("worktrees").exists())
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve repository root for deploy module.".to_string())
}

#[cfg(not(target_arch = "wasm32"))]
fn deploy_target(remote: &str, auth: &GitAuth, target: &DeployTarget) -> Result<(), String> {
    if !target.source_path.exists() {
        return Err(format!("Deploy source path missing: {}", target.source_path.display()));
    }

    let temp_root = env::temp_dir().join(format!(
        "quantum-deploy-{}-{}",
        target.branch.replace('/', "-"),
        SystemTime::now().duration_since(UNIX_EPOCH).map_err(|err| err.to_string())?.as_secs()
    ));

    run_git(
        auth,
        None,
        [
            OsStr::new("clone"),
            OsStr::new("--depth"),
            OsStr::new("1"),
            OsStr::new("--branch"),
            OsStr::new(target.branch),
            OsStr::new(remote),
            temp_root.as_os_str(),
        ],
    )?;

    run_git(auth, Some(&temp_root), [OsStr::new("config"), OsStr::new("user.name"), OsStr::new(DEPLOY_AUTHOR_NAME)])?;
    run_git(auth, Some(&temp_root), [OsStr::new("config"), OsStr::new("user.email"), OsStr::new(DEPLOY_AUTHOR_EMAIL)])?;

    copy_worktree(&target.source_path, &temp_root)?;

    let status = run_git_capture(auth, Some(&temp_root), [OsStr::new("status"), OsStr::new("--porcelain")])?;
    if status.trim().is_empty() {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    run_git(auth, Some(&temp_root), [OsStr::new("add"), OsStr::new("-A")])?;
    run_git(
        auth,
        Some(&temp_root),
        [OsStr::new("commit"), OsStr::new("-m"), OsStr::new(target.commit_message)],
    )?;
    run_git(auth, Some(&temp_root), [OsStr::new("push"), OsStr::new("origin"), OsStr::new(target.branch)])?;
    let _ = fs::remove_dir_all(&temp_root);
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn copy_worktree(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in fs::read_dir(source).map_err(io_to_string)? {
        let entry = entry.map_err(io_to_string)?;
        let path = entry.path();
        let file_name = entry.file_name();
        if should_skip_path(&file_name) {
            continue;
        }
        let target_path = destination.join(&file_name);
        if entry.file_type().map_err(io_to_string)?.is_dir() {
            if target_path.exists() {
                fs::remove_dir_all(&target_path).map_err(io_to_string)?;
            }
            copy_dir_recursive(&path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(io_to_string)?;
            }
            fs::copy(&path, &target_path).map_err(io_to_string)?;
        }
    }
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(io_to_string)?;
    for entry in fs::read_dir(source).map_err(io_to_string)? {
        let entry = entry.map_err(io_to_string)?;
        let path = entry.path();
        let file_name = entry.file_name();
        if should_skip_path(&file_name) {
            continue;
        }
        let target_path = destination.join(&file_name);
        if entry.file_type().map_err(io_to_string)?.is_dir() {
            copy_dir_recursive(&path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(io_to_string)?;
            }
            fs::copy(&path, &target_path).map_err(io_to_string)?;
        }
    }
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn should_skip_path(name: &std::ffi::OsString) -> bool {
    matches!(
        name.to_string_lossy().as_ref(),
        ".git" | ".cargo-home" | ".rustup-home" | "target-local" | "node_modules" | ".next" | "target"
    )
}

#[cfg(not(target_arch = "wasm32"))]
fn run_git<I, S>(auth: &GitAuth, cwd: Option<&Path>, args: I) -> Result<(), String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = git_command(auth, cwd, args)?.output().map_err(io_to_string)?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[cfg(not(target_arch = "wasm32"))]
fn run_git_capture<I, S>(auth: &GitAuth, cwd: Option<&Path>, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = git_command(auth, cwd, args)?.output().map_err(io_to_string)?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[cfg(not(target_arch = "wasm32"))]
fn git_command<I, S>(auth: &GitAuth, cwd: Option<&Path>, args: I) -> Result<Command, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new("git");
    command.args(args);
    command.stdin(Stdio::null());
    if let Some(path) = cwd {
        command.current_dir(path);
    }
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("GCM_INTERACTIVE", "Never");
    auth.apply(&mut command)?;
    Ok(command)
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Clone)]
enum GitAuth {
    GithubToken(String),
    SshKey(PathBuf),
    Passive,
}

#[cfg(not(target_arch = "wasm32"))]
impl GitAuth {
    fn discover() -> Result<Self, String> {
        if let Ok(token) = env::var("QUANTUM_GIT_TOKEN") {
            if !token.trim().is_empty() {
                return Ok(Self::GithubToken(token));
            }
        }
        if let Some(token) = gh_auth_token()? {
            return Ok(Self::GithubToken(token));
        }
        if let Ok(path) = env::var("QUANTUM_GIT_SSH_KEY") {
            if !path.trim().is_empty() {
                return Ok(Self::SshKey(PathBuf::from(path)));
            }
        }
        Ok(Self::Passive)
    }

    fn authenticated_remote(&self, fallback: &str) -> Result<String, String> {
        match self {
            Self::GithubToken(token) => Ok(format!("https://x-access-token:{token}@github.com/{REPO_SLUG}.git")),
            Self::SshKey(_) => Ok(format!("git@github.com:{REPO_SLUG}.git")),
            Self::Passive => Ok(fallback.to_string()),
        }
    }

    fn apply(&self, command: &mut Command) -> Result<(), String> {
        if let Self::SshKey(path) = self {
            let ssh_command = format!("ssh -i \"{}\" -o IdentitiesOnly=yes", path.display());
            command.env("GIT_SSH_COMMAND", ssh_command);
        }
        Ok(())
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn gh_auth_token() -> Result<Option<String>, String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(io_to_string)?;
    if !output.status.success() {
        return Ok(None);
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Ok(None);
    }
    Ok(Some(token))
}

#[cfg(not(target_arch = "wasm32"))]
fn io_to_string(error: io::Error) -> String {
    error.to_string()
}
