use crate::models::QuantumError;
use crate::mutex_manager::with_v_drive_write_lock;
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_OLLAMA_MODEL: &str = "llama3.1:8b";
const DEFAULT_LLAMA_CPP_MODEL_PATH: &str = "vault/models/llama-3-8b-instruct-q4_k_m.gguf";
const DEFAULT_GROK_MODEL: &str = "grok-4.3";
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-pro";
const DEFAULT_OPENAI_MODEL: &str = "gpt-4.1";
const DEFAULT_OPENAI_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_GEMINI_API_ROOT: &str = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_XAI_RESPONSES_ENDPOINT: &str = "https://api.x.ai/v1/responses";
const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 1024;
const DEFAULT_TEMPERATURE: f32 = 0.2;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum CognitiveDemand {
    Tier1Local,
    Tier2Remote,
}

impl CognitiveDemand {
    pub fn route(self) -> RoutingLane {
        match self {
            Self::Tier1Local => RoutingLane::LocalEngine,
            Self::Tier2Remote => RoutingLane::RemoteBridge,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum RoutingLane {
    LocalEngine,
    RemoteBridge,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum LocalEngineKind {
    OllamaCli,
    LlamaCppCli,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum RemoteProvider {
    Grok,
    OpenAi,
    Gemini,
}

#[derive(Debug, Clone)]
pub struct UmgImageInput {
    pub image_url: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UmgJsonSchema {
    pub name: String,
    pub schema: Value,
}

#[derive(Debug, Clone)]
pub struct UmgConfig {
    pub ollama_cli_path: PathBuf,
    pub llama_cpp_cli_path: PathBuf,
    pub llama_cpp_model_path: PathBuf,
    pub xai_responses_endpoint: String,
    pub openai_endpoint: String,
    pub gemini_api_root: String,
}

impl Default for UmgConfig {
    fn default() -> Self {
        Self {
            ollama_cli_path: PathBuf::from(
                std::env::var("UMG_OLLAMA_CLI").unwrap_or_else(|_| "ollama".to_string()),
            ),
            llama_cpp_cli_path: PathBuf::from(
                std::env::var("UMG_LLAMA_CPP_CLI").unwrap_or_else(|_| "llama-cli".to_string()),
            ),
            llama_cpp_model_path: PathBuf::from(
                std::env::var("UMG_LLAMA_CPP_MODEL")
                    .unwrap_or_else(|_| DEFAULT_LLAMA_CPP_MODEL_PATH.to_string()),
            ),
            xai_responses_endpoint: std::env::var("UMG_XAI_RESPONSES_ENDPOINT")
                .unwrap_or_else(|_| DEFAULT_XAI_RESPONSES_ENDPOINT.to_string()),
            openai_endpoint: std::env::var("UMG_OPENAI_ENDPOINT")
                .unwrap_or_else(|_| DEFAULT_OPENAI_ENDPOINT.to_string()),
            gemini_api_root: std::env::var("UMG_GEMINI_API_ROOT")
                .unwrap_or_else(|_| DEFAULT_GEMINI_API_ROOT.to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct UmgRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub demand: CognitiveDemand,
    pub local_engine: Option<LocalEngineKind>,
    pub remote_provider: Option<RemoteProvider>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
    pub output_path: Option<PathBuf>,
    pub input_images: Vec<UmgImageInput>,
    pub response_schema: Option<UmgJsonSchema>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UmgResponse {
    pub route: RoutingLane,
    pub backend: String,
    pub model: String,
    pub output_text: String,
    pub persisted_path: Option<String>,
}

impl UmgResponse {
    pub fn persist_to_path(&mut self, path: &Path) -> Result<(), QuantumError> {
        let rendered = self.output_text.as_bytes();
        with_v_drive_write_lock(path, || {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    QuantumError::IOFailure(format!(
                        "failed to create UMG output directory {}: {error}",
                        parent.display()
                    ))
                })?;
            }
            fs::write(path, rendered).map_err(|error| {
                QuantumError::IOFailure(format!(
                    "failed to persist UMG output to {}: {error}",
                    path.display()
                ))
            })?;
            Ok(())
        })?;
        self.persisted_path = Some(path.display().to_string());
        Ok(())
    }
}

trait InferenceExecutor {
    fn infer(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError>;
}

pub struct UniversalModelGateway {
    local: LocalEngineExecutor,
    remote: RemoteBridgeExecutor,
}

impl UniversalModelGateway {
    pub fn new(config: UmgConfig) -> Self {
        Self {
            local: LocalEngineExecutor {
                config: config.clone(),
            },
            remote: RemoteBridgeExecutor { config },
        }
    }

    pub fn infer(&self, request: UmgRequest) -> Result<UmgResponse, QuantumError> {
        let output_path = request.output_path.clone();
        let mut response = match request.demand.route() {
            RoutingLane::LocalEngine => self.local.infer(&request)?,
            RoutingLane::RemoteBridge => self.remote.infer(&request)?,
        };

        if let Some(path) = output_path {
            response.persist_to_path(&path)?;
        }

        Ok(response)
    }
}

impl Default for UniversalModelGateway {
    fn default() -> Self {
        Self::new(UmgConfig::default())
    }
}

struct LocalEngineExecutor {
    config: UmgConfig,
}

impl InferenceExecutor for LocalEngineExecutor {
    fn infer(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        let engine = request.local_engine.unwrap_or(LocalEngineKind::OllamaCli);
        match engine {
            LocalEngineKind::OllamaCli => self.run_ollama(request),
            LocalEngineKind::LlamaCppCli => self.run_llama_cpp(request),
        }
    }
}

impl LocalEngineExecutor {
    fn run_ollama(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        let model = request
            .model
            .clone()
            .unwrap_or_else(|| DEFAULT_OLLAMA_MODEL.to_string());
        let prompt = render_prompt(request);
        let output = Command::new(&self.config.ollama_cli_path)
            .args(["run", &model, &prompt])
            .output()
            .map_err(|error| {
                QuantumError::CriticalFault(format!(
                    "failed to launch Ollama CLI at {}: {error}",
                    self.config.ollama_cli_path.display()
                ))
            })?;

        if !output.status.success() {
            return Err(QuantumError::CriticalFault(format!(
                "Ollama CLI exited with status {} stderr={}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }

        Ok(UmgResponse {
            route: RoutingLane::LocalEngine,
            backend: "ollama-cli".to_string(),
            model,
            output_text: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            persisted_path: None,
        })
    }

    fn run_llama_cpp(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        let prompt = render_prompt(request);
        let max_output_tokens = request
            .max_output_tokens
            .unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS)
            .to_string();
        let temperature = request
            .temperature
            .unwrap_or(DEFAULT_TEMPERATURE)
            .to_string();
        let model_path = request
            .model
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| self.config.llama_cpp_model_path.clone());
        let output = Command::new(&self.config.llama_cpp_cli_path)
            .args([
                "-m",
                &model_path.display().to_string(),
                "-p",
                &prompt,
                "-n",
                &max_output_tokens,
                "--temp",
                &temperature,
            ])
            .output()
            .map_err(|error| {
                QuantumError::CriticalFault(format!(
                    "failed to launch llama.cpp CLI at {}: {error}",
                    self.config.llama_cpp_cli_path.display()
                ))
            })?;

        if !output.status.success() {
            return Err(QuantumError::CriticalFault(format!(
                "llama.cpp CLI exited with status {} stderr={}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }

        Ok(UmgResponse {
            route: RoutingLane::LocalEngine,
            backend: "llama.cpp-cli".to_string(),
            model: model_path.display().to_string(),
            output_text: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            persisted_path: None,
        })
    }
}

struct RemoteBridgeExecutor {
    config: UmgConfig,
}

impl InferenceExecutor for RemoteBridgeExecutor {
    fn infer(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| {
                QuantumError::CriticalFault(format!(
                    "failed to build UMG remote runtime: {error}"
                ))
            })?;
        runtime.block_on(self.infer_async(request))
    }
}

impl RemoteBridgeExecutor {
    async fn infer_async(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        let provider = request.remote_provider.unwrap_or(RemoteProvider::Grok);
        match provider {
            RemoteProvider::Grok => self.call_grok(request).await,
            RemoteProvider::OpenAi => self.call_openai(request).await,
            RemoteProvider::Gemini => self.call_gemini(request).await,
        }
    }

    async fn call_grok(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        let service = "umg-grok";
        let api_key = std::env::var("XAI_API_KEY")
            .or_else(|_| std::env::var("UMG_XAI_API_KEY"))
            .map_err(|_| {
                QuantumError::CriticalFault("UMG remote bridge missing XAI_API_KEY".to_string())
            })?;
        let model = request
            .model
            .clone()
            .unwrap_or_else(|| DEFAULT_GROK_MODEL.to_string());
        let mut payload = json!({
            "model": model,
            "store": false,
            "input": build_grok_input(request),
            "temperature": request.temperature.unwrap_or(DEFAULT_TEMPERATURE),
            "max_output_tokens": request.max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
        });
        if let Some(schema) = request.response_schema.as_ref() {
            payload["text"] = json!({
                "format": {
                    "type": "json_schema",
                    "name": schema.name,
                    "schema": schema.schema,
                    "strict": true,
                }
            });
        }

        let client = Client::new();
        let response = client
            .post(&self.config.xai_responses_endpoint)
            .bearer_auth(api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|error| QuantumError::Transport {
                service,
                message: error.to_string(),
            })?;
        let status = response.status();
        let body = response.text().await.map_err(|error| QuantumError::Transport {
            service,
            message: error.to_string(),
        })?;
        if !status.is_success() {
            return Err(QuantumError::Http {
                service,
                status: status.as_u16(),
                body,
            });
        }

        let value: Value = serde_json::from_str(&body).map_err(|error| QuantumError::JsonDecode {
            service,
            message: error.to_string(),
            body: body.clone(),
        })?;
        let output_text = extract_xai_output(&value).ok_or_else(|| QuantumError::JsonDecode {
            service,
            message: "missing output_text inside response.output".to_string(),
            body: body.clone(),
        })?;

        Ok(UmgResponse {
            route: RoutingLane::RemoteBridge,
            backend: "grok-responses-http".to_string(),
            model,
            output_text,
            persisted_path: None,
        })
    }

    async fn call_openai(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        ensure_text_only_remote(request, "openai")?;

        let service = "umg-openai";
        let api_key = std::env::var("OPENAI_API_KEY")
            .or_else(|_| std::env::var("UMG_OPENAI_API_KEY"))
            .map_err(|_| {
                QuantumError::CriticalFault(
                    "UMG remote bridge missing OPENAI_API_KEY".to_string(),
                )
            })?;
        let model = request
            .model
            .clone()
            .unwrap_or_else(|| DEFAULT_OPENAI_MODEL.to_string());
        let payload = json!({
            "model": model,
            "messages": openai_messages(request),
            "temperature": request.temperature.unwrap_or(DEFAULT_TEMPERATURE),
            "max_tokens": request.max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
        });
        let client = Client::new();
        let response = client
            .post(&self.config.openai_endpoint)
            .bearer_auth(api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|error| QuantumError::Transport {
                service,
                message: error.to_string(),
            })?;
        let status = response.status();
        let body = response.text().await.map_err(|error| QuantumError::Transport {
            service,
            message: error.to_string(),
        })?;
        if !status.is_success() {
            return Err(QuantumError::Http {
                service,
                status: status.as_u16(),
                body,
            });
        }

        let value: Value = serde_json::from_str(&body).map_err(|error| QuantumError::JsonDecode {
            service,
            message: error.to_string(),
            body: body.clone(),
        })?;
        let output_text = extract_openai_output(&value).ok_or_else(|| QuantumError::JsonDecode {
            service,
            message: "missing choices[0].message.content".to_string(),
            body: body.clone(),
        })?;

        Ok(UmgResponse {
            route: RoutingLane::RemoteBridge,
            backend: "openai-http".to_string(),
            model,
            output_text,
            persisted_path: None,
        })
    }

    async fn call_gemini(&self, request: &UmgRequest) -> Result<UmgResponse, QuantumError> {
        ensure_text_only_remote(request, "gemini")?;

        let service = "umg-gemini";
        let api_key = std::env::var("GEMINI_API_KEY")
            .or_else(|_| std::env::var("GOOGLE_API_KEY"))
            .or_else(|_| std::env::var("UMG_GEMINI_API_KEY"))
            .map_err(|_| {
                QuantumError::CriticalFault(
                    "UMG remote bridge missing GEMINI_API_KEY".to_string(),
                )
            })?;
        let model = request
            .model
            .clone()
            .unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string());
        let endpoint = format!(
            "{}/models/{}:generateContent?key={}",
            self.config.gemini_api_root.trim_end_matches('/'),
            model,
            api_key
        );
        let mut payload = json!({
            "contents": [{
                "parts": [{
                    "text": request.prompt
                }]
            }],
            "generationConfig": {
                "temperature": request.temperature.unwrap_or(DEFAULT_TEMPERATURE),
                "maxOutputTokens": request.max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
            }
        });
        if let Some(system_prompt) = request.system_prompt.as_deref() {
            payload["system_instruction"] = json!({
                "parts": [{
                    "text": system_prompt
                }]
            });
        }

        let client = Client::new();
        let response = client
            .post(endpoint)
            .json(&payload)
            .send()
            .await
            .map_err(|error| QuantumError::Transport {
                service,
                message: error.to_string(),
            })?;
        let status = response.status();
        let body = response.text().await.map_err(|error| QuantumError::Transport {
            service,
            message: error.to_string(),
        })?;
        if !status.is_success() {
            return Err(QuantumError::Http {
                service,
                status: status.as_u16(),
                body,
            });
        }

        let value: Value = serde_json::from_str(&body).map_err(|error| QuantumError::JsonDecode {
            service,
            message: error.to_string(),
            body: body.clone(),
        })?;
        let output_text = extract_gemini_output(&value).ok_or_else(|| QuantumError::JsonDecode {
            service,
            message: "missing candidates[0].content.parts".to_string(),
            body: body.clone(),
        })?;

        Ok(UmgResponse {
            route: RoutingLane::RemoteBridge,
            backend: "gemini-http".to_string(),
            model,
            output_text,
            persisted_path: None,
        })
    }
}

fn build_grok_input(request: &UmgRequest) -> Value {
    let mut input = Vec::new();
    if let Some(system_prompt) = request.system_prompt.as_deref().filter(|value| not_blank(value)) {
        input.push(json!({
            "role": "system",
            "content": system_prompt,
        }));
    }

    if request.input_images.is_empty() {
        input.push(json!({
            "role": "user",
            "content": request.prompt,
        }));
        return Value::Array(input);
    }

    let mut content = Vec::new();
    for image in &request.input_images {
        let mut image_entry = json!({
            "type": "input_image",
            "image_url": image.image_url,
        });
        if let Some(detail) = image.detail.as_deref().filter(|value| not_blank(value)) {
            image_entry["detail"] = json!(detail);
        }
        content.push(image_entry);
    }
    if not_blank(&request.prompt) {
        content.push(json!({
            "type": "input_text",
            "text": request.prompt,
        }));
    }

    input.push(json!({
        "role": "user",
        "content": content,
    }));

    Value::Array(input)
}

fn ensure_text_only_remote(request: &UmgRequest, provider: &str) -> Result<(), QuantumError> {
    if request.input_images.is_empty() && request.response_schema.is_none() {
        return Ok(());
    }

    Err(QuantumError::CriticalFault(format!(
        "UMG {provider} lane is forged for text-only requests; route images or structured vision output through RemoteProvider::Grok"
    )))
}

fn render_prompt(request: &UmgRequest) -> String {
    match request.system_prompt.as_deref() {
        Some(system_prompt) if not_blank(system_prompt) => {
            format!("SYSTEM:\n{system_prompt}\n\nUSER:\n{}", request.prompt)
        }
        _ => request.prompt.clone(),
    }
}

fn openai_messages(request: &UmgRequest) -> Vec<Value> {
    let mut messages = Vec::new();
    if let Some(system_prompt) = request.system_prompt.as_deref() {
        if not_blank(system_prompt) {
            messages.push(json!({
                "role": "system",
                "content": system_prompt,
            }));
        }
    }
    messages.push(json!({
        "role": "user",
        "content": request.prompt,
    }));
    messages
}

fn extract_openai_output(value: &Value) -> Option<String> {
    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?;
    match content {
        Value::String(text) => Some(text.trim().to_string()),
        Value::Array(parts) => {
            let joined = parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n");
            not_blank(&joined).then_some(joined)
        }
        _ => None,
    }
}

fn extract_gemini_output(value: &Value) -> Option<String> {
    let parts = value
        .get("candidates")?
        .as_array()?
        .first()?
        .get("content")?
        .get("parts")?
        .as_array()?;
    let joined = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    not_blank(&joined).then_some(joined)
}

fn extract_xai_output(value: &Value) -> Option<String> {
    let output = value.get("output")?.as_array()?;
    for item in output {
        if item.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }
        let content = item.get("content")?.as_array()?;
        for entry in content {
            if entry.get("type").and_then(Value::as_str) == Some("output_text") {
                if let Some(text) = entry.get("text").and_then(Value::as_str) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }
    None
}

fn not_blank(value: &str) -> bool {
    !value.trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::{
        extract_xai_output, CognitiveDemand, RoutingLane, UmgImageInput, UmgResponse,
        UniversalModelGateway,
    };
    use serde_json::json;

    #[test]
    fn routes_cognitive_demand_to_expected_lane() {
        assert_eq!(CognitiveDemand::Tier1Local.route(), RoutingLane::LocalEngine);
        assert_eq!(CognitiveDemand::Tier2Remote.route(), RoutingLane::RemoteBridge);
    }

    #[test]
    fn persists_response_to_non_v_path() {
        let mut response = UmgResponse {
            route: RoutingLane::LocalEngine,
            backend: "test".to_string(),
            model: "unit".to_string(),
            output_text: "forge-output".to_string(),
            persisted_path: None,
        };
        let temp_path = std::env::temp_dir().join(format!(
            "quantum-umg-persist-{}.txt",
            std::process::id()
        ));
        response.persist_to_path(&temp_path).expect("persist response");
        assert_eq!(
            std::fs::read_to_string(&temp_path).expect("read persisted"),
            "forge-output"
        );
        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn default_gateway_constructs() {
        let _ = UniversalModelGateway::default();
    }

    #[test]
    fn extracts_xai_output_text_from_responses_shape() {
        let payload = json!({
            "output": [{
                "type": "message",
                "content": [{
                    "type": "output_text",
                    "text": "{\"title\":\"Forge\"}"
                }]
            }]
        });
        assert_eq!(
            extract_xai_output(&payload),
            Some("{\"title\":\"Forge\"}".to_string())
        );
    }

    #[test]
    fn image_input_accepts_data_url() {
        let image = UmgImageInput {
            image_url: "data:image/png;base64,Zm9yZ2U=".to_string(),
            detail: Some("high".to_string()),
        };
        assert!(image.image_url.starts_with("data:image/png;base64,"));
    }
}
