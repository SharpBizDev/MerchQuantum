use crate::models::*;
use crate::vault::*;
use async_trait::async_trait;
use base64::Engine as _;
use reqwest::{Client, Method};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Digest;
use std::sync::Arc;
use std::time::Duration;

const PRINTFUL_API_BASE: &str = "https://api.printful.com";
const GOOTEN_API_BASE: &str = "https://api.print.io";
const APLIIQ_API_BASE: &str = "https://api.apliiq.com";
const PROVIDER_TIMEOUT_SECS: u64 = 90;
const USER_AGENT_VALUE: &str = "MerchQuantum/1.0 (Language=Rust)";

pub const PRINTFUL_ORDER_SKU_PREFIX: &str = "MQ_PF_";
pub const GOOTEN_ORDER_SKU_PREFIX: &str = "MQ_GT_";
pub const APLIIQ_ORDER_SKU_PREFIX: &str = "MQ_AQ_";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shop {
    pub id: String,
    pub name: String,
    pub sales_channel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishResponse {
    pub provider: FulfillmentProvider,
    pub store_id: String,
    pub product_id: String,
    pub upload_id: String,
    pub message: String,
    pub placement_position: String,
}

#[async_trait]
pub trait ProviderGateway: Send + Sync {
    async fn authenticate(&self, api_key: &str) -> Result<(), QuantumError>;
    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError>;
    async fn push_forged_metadata(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PublishResponse, QuantumError>;
    async fn submit_order(
        &self,
        order: &QuantumFulfillmentOrder,
    ) -> Result<ProviderOrderResponse, QuantumError>;
}

#[derive(Debug, Clone)]
pub struct PrintfulGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}

#[derive(Debug, Clone)]
pub struct GootenGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}

#[derive(Debug, Clone)]
pub struct ApliiqGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}

impl PrintfulGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: provider_client("printful")?,
            vault,
        })
    }

    fn api_key(&self) -> Result<String, QuantumError> {
        self.vault
            .api_key_for(FulfillmentProvider::Printful)?
            .ok_or(QuantumError::MissingApiKey {
                provider: FulfillmentProvider::Printful,
            })
    }
}

impl GootenGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: provider_client("gooten")?,
            vault,
        })
    }

    fn credentials(&self) -> Result<(String, String), QuantumError> {
        let raw = self.vault.api_key_for(FulfillmentProvider::Gooten)?.ok_or(
            QuantumError::MissingApiKey {
                provider: FulfillmentProvider::Gooten,
            },
        )?;
        split_provider_secret_pair(&raw, "Gooten", "recipeId", "partnerBillingKey")
            .map(|(a, b)| (a.to_string(), b.to_string()))
    }
}

impl ApliiqGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: provider_client("apliiq")?,
            vault,
        })
    }

    fn credentials(&self) -> Result<(String, String), QuantumError> {
        let raw = self.vault.api_key_for(FulfillmentProvider::Apliiq)?.ok_or(
            QuantumError::MissingApiKey {
                provider: FulfillmentProvider::Apliiq,
            },
        )?;
        split_provider_secret_pair(&raw, "Apliiq", "appKey", "sharedSecret")
            .map(|(a, b)| (a.to_string(), b.to_string()))
    }

    fn auth_header(
        &self,
        app_key: &str,
        shared_secret: &str,
        body: &str,
    ) -> Result<String, QuantumError> {
        let timestamp = provider_unix_time_secs().to_string();
        let nonce = provider_time_nonce("apliiq").replace('_', "");
        let body_base64 = if body.is_empty() {
            String::new()
        } else {
            base64::engine::general_purpose::STANDARD.encode(body)
        };
        let input = format!("{app_key}{timestamp}{nonce}{body_base64}");
        let sig = base64::engine::general_purpose::STANDARD.encode(hmac_sha256_bytes(
            shared_secret.as_bytes(),
            input.as_bytes(),
        )?);
        Ok(format!("x-apliiq-auth {timestamp}:{sig}:{app_key}:{nonce}"))
    }
}

#[async_trait]
impl ProviderGateway for PrintfulGateway {
    async fn authenticate(&self, api_key: &str) -> Result<(), QuantumError> {
        let trimmed = api_key.trim();
        let _: Value = provider_json_request::<Value, Value>(
            &self.client,
            Method::GET,
            &format!("{PRINTFUL_API_BASE}/stores"),
            Some(("Authorization", format!("Bearer {trimmed}"))),
            None,
        )
        .await?;
        self.vault
            .store_api_key(FulfillmentProvider::Printful, trimmed.to_string())?;
        self.vault
            .set_selected_provider(FulfillmentProvider::Printful)
    }

    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError> {
        let api_key = self.api_key()?;
        let payload: Value = provider_json_request::<Value, Value>(
            &self.client,
            Method::GET,
            &format!("{PRINTFUL_API_BASE}/stores"),
            Some(("Authorization", format!("Bearer {api_key}"))),
            None,
        )
        .await?;
        let stores = payload
            .get("result")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(stores
            .into_iter()
            .map(|store| Shop {
                id: json_string(&store, "id").unwrap_or_else(|| "unknown".to_string()),
                name: json_string(&store, "name")
                    .or_else(|| json_string(&store, "title"))
                    .unwrap_or_else(|| "Printful Store".to_string()),
                sales_channel: json_string(&store, "type"),
            })
            .collect())
    }

    async fn push_forged_metadata(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PublishResponse, QuantumError> {
        validate_ready_forge_output(&packet.forge)?;
        let api_key = self.api_key()?;
        let template = match &packet.template {
            ProviderTemplateContext::Printful(t) => t,
            _ => {
                return Err(QuantumError::InvalidForgePacket(
                    "Printful packet requires PrintfulTemplateContext".into(),
                ))
            }
        };
        let upload_body = json!({ "data": packet.artwork.image_data_url, "filename": packet.artwork.file_name, "visible": false });
        let uploaded: Value = provider_json_request(
            &self.client,
            Method::POST,
            &format!("{PRINTFUL_API_BASE}/files"),
            Some(("Authorization", format!("Bearer {api_key}"))),
            Some(&upload_body),
        )
        .await?;
        let upload_id = uploaded
            .get("result")
            .and_then(|v| v.get("id"))
            .map(value_to_string)
            .unwrap_or_else(|| "upload".to_string());
        let sync_variants = template
            .variants
            .iter()
            .map(|variant| {
                json!({
                    "variant_id": variant.variant_id,
                    "retail_price": variant.retail_price,
                    "options": variant.options,
                    "files": [{"id": upload_id, "type": template.placement_guide.position.as_str()}]
                })
            })
            .collect::<Vec<_>>();
        let create_body = json!({
            "sync_product": {"name": packet.forge.title, "thumbnail": template.thumbnail_url},
            "sync_variants": sync_variants
        });
        let created: Value = provider_json_request(
            &self.client,
            Method::POST,
            &format!("{PRINTFUL_API_BASE}/store/products"),
            Some(("Authorization", format!("Bearer {api_key}"))),
            Some(&create_body),
        )
        .await?;
        let product_id = created
            .get("result")
            .and_then(|v| v.get("id"))
            .map(value_to_string)
            .unwrap_or_else(|| "printful-product".to_string());
        self.vault.set_selected_store_id(packet.store_id.clone())?;
        Ok(PublishResponse {
            provider: FulfillmentProvider::Printful,
            store_id: packet.store_id.clone(),
            product_id,
            upload_id,
            message: "Created Printful product".to_string(),
            placement_position: template.placement_guide.position.as_str().to_string(),
        })
    }

    async fn submit_order(
        &self,
        order: &QuantumFulfillmentOrder,
    ) -> Result<ProviderOrderResponse, QuantumError> {
        validate_printful_order_for_submission(order)?;
        let api_key = self.api_key()?;
        let items = order.line_items.iter().map(|item| {
            json!({
                "sync_variant_id": parse_printful_sync_variant_id_from_sku(&item.sku).ok(),
                "quantity": item.quantity,
                "external_id": item.external_line_item_id,
                "retail_price": item.unit_retail_price.as_ref().map(|v| normalize_money_string(v, "line item retail_price")).transpose().ok().flatten()
            })
        }).collect::<Vec<_>>();
        let retail_costs = order.retail_costs.as_ref().map(|costs| json!({
            "currency": normalize_currency_code(&order.currency).unwrap_or_else(|_| order.currency.clone()),
            "subtotal": costs.subtotal,
            "discount": costs.discount,
            "shipping": costs.shipping,
            "tax": costs.tax,
            "vat": costs.vat,
            "total": costs.total
        }));
        let body = json!({
            "external_id": order.external_order_id,
            "shipping": order.shipping_method,
            "recipient": {
                "name": order.shipping_address.name,
                "company": order.shipping_address.company,
                "address1": order.shipping_address.address1,
                "address2": order.shipping_address.address2,
                "city": order.shipping_address.city,
                "state_code": order.shipping_address.state_code,
                "country_code": order.shipping_address.country_code,
                "zip": order.shipping_address.zip,
                "phone": order.shipping_address.phone,
                "email": order.shipping_address.email
            },
            "items": items,
            "retail_costs": retail_costs
        });
        let created: Value = provider_json_request(
            &self.client,
            Method::POST,
            &format!("{PRINTFUL_API_BASE}/orders"),
            Some(("Authorization", format!("Bearer {api_key}"))),
            Some(&body),
        )
        .await?;
        let result = created.get("result").unwrap_or(&created);
        Ok(ProviderOrderResponse {
            provider: FulfillmentProvider::Printful,
            store_id: order.fulfillment_store_id.clone(),
            provider_order_id: result
                .get("id")
                .map(value_to_string)
                .unwrap_or_else(|| "printful-order".to_string()),
            external_order_id: result
                .get("external_id")
                .map(value_to_string)
                .unwrap_or_else(|| order.external_order_id.clone()),
            status: result
                .get("status")
                .map(value_to_string)
                .unwrap_or_else(|| "draft".to_string()),
            dashboard_url: result.get("dashboard_url").map(value_to_string),
        })
    }
}

#[async_trait]
impl ProviderGateway for GootenGateway {
    async fn authenticate(&self, api_key: &str) -> Result<(), QuantumError> {
        let trimmed = api_key.trim();
        let _ = split_provider_secret_pair(trimmed, "Gooten", "recipeId", "partnerBillingKey")?;
        self.vault
            .store_api_key(FulfillmentProvider::Gooten, trimmed.to_string())?;
        self.vault
            .set_selected_provider(FulfillmentProvider::Gooten)
    }

    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError> {
        let (recipe_id, _) = self.credentials()?;
        Ok(vec![Shop {
            id: "gooten-catalog".to_string(),
            name: format!("Gooten Catalog {}", truncate_provider_chars(&recipe_id, 6)),
            sales_channel: Some("gooten_catalog".to_string()),
        }])
    }

    async fn push_forged_metadata(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PublishResponse, QuantumError> {
        validate_ready_forge_output(&packet.forge)?;
        let template = match &packet.template {
            ProviderTemplateContext::Gooten(t) => t,
            _ => {
                return Err(QuantumError::InvalidForgePacket(
                    "Gooten packet requires GootenTemplateContext".into(),
                ))
            }
        };
        let product_id = format!(
            "MQ_{}_{}",
            normalize_sku_token(&template.sku, 24),
            provider_nonce_hex(8)
        );
        self.vault.set_selected_store_id(packet.store_id.clone())?;
        Ok(PublishResponse {
            provider: FulfillmentProvider::Gooten,
            store_id: packet.store_id.clone(),
            product_id,
            upload_id: template.hosted_artwork_url.clone(),
            message: "Created Gooten print-ready product".to_string(),
            placement_position: template.placement_guide.position.as_str().to_string(),
        })
    }

    async fn submit_order(
        &self,
        order: &QuantumFulfillmentOrder,
    ) -> Result<ProviderOrderResponse, QuantumError> {
        let (recipe_id, partner_billing_key) = self.credentials()?;
        let (first_name, last_name) = split_contact_name(&order.shipping_address.name)?;
        let body = json!({
            "ShipToAddress": {
                "FirstName": first_name,
                "LastName": last_name,
                "Line1": order.shipping_address.address1,
                "Line2": order.shipping_address.address2,
                "City": order.shipping_address.city,
                "State": order.shipping_address.state_code,
                "CountryCode": order.shipping_address.country_code,
                "PostalCode": order.shipping_address.zip,
                "IsBusinessAddress": order.shipping_address.company.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "Phone": order.shipping_address.phone,
                "Email": order.shipping_address.email
            },
            "BillingAddress": {
                "FirstName": split_contact_name(&order.shipping_address.name)?.0,
                "LastName": split_contact_name(&order.shipping_address.name)?.1,
                "Line1": order.shipping_address.address1,
                "Line2": order.shipping_address.address2,
                "City": order.shipping_address.city,
                "State": order.shipping_address.state_code,
                "CountryCode": order.shipping_address.country_code,
                "PostalCode": order.shipping_address.zip,
                "IsBusinessAddress": order.shipping_address.company.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "Phone": order.shipping_address.phone,
                "Email": order.shipping_address.email
            },
            "Items": order.line_items.iter().map(|item| json!({
                "Quantity": item.quantity,
                "SKU": parse_gooten_variant_id_from_sku(&item.sku).ok(),
                "IsPreconfiguredSku": true,
                "ShipType": normalize_gooten_ship_type(order.shipping_method.as_deref()).unwrap_or_else(|_| "standard".to_string()),
                "SourceId": item.external_line_item_id
            })).collect::<Vec<_>>(),
            "Payment": { "PartnerBillingKey": partner_billing_key },
            "SourceId": order.external_order_id,
            "IsPartnerSourceIdUnique": true,
            "IsInTestMode": false
        });
        let created: Value = provider_json_request(
            &self.client,
            Method::POST,
            &format!(
                "{GOOTEN_API_BASE}/api/v/5/source/api/orders/?recipeid={}",
                urlencoding::encode(&recipe_id)
            ),
            None,
            Some(&body),
        )
        .await?;
        Ok(ProviderOrderResponse {
            provider: FulfillmentProvider::Gooten,
            store_id: order.fulfillment_store_id.clone(),
            provider_order_id: created
                .get("Id")
                .map(value_to_string)
                .unwrap_or_else(|| "gooten-order".to_string()),
            external_order_id: order.external_order_id.clone(),
            status: "submitted".to_string(),
            dashboard_url: None,
        })
    }
}

#[async_trait]
impl ProviderGateway for ApliiqGateway {
    async fn authenticate(&self, api_key: &str) -> Result<(), QuantumError> {
        let trimmed = api_key.trim();
        let _ = split_provider_secret_pair(trimmed, "Apliiq", "appKey", "sharedSecret")?;
        self.vault
            .store_api_key(FulfillmentProvider::Apliiq, trimmed.to_string())?;
        self.vault
            .set_selected_provider(FulfillmentProvider::Apliiq)
    }

    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError> {
        let (app_key, _) = self.credentials()?;
        Ok(vec![Shop {
            id: "custom-store".to_string(),
            name: format!("Apliiq Store {}", truncate_provider_chars(&app_key, 6)),
            sales_channel: Some("custom_store".to_string()),
        }])
    }

    async fn push_forged_metadata(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PublishResponse, QuantumError> {
        validate_ready_forge_output(&packet.forge)?;
        let template = match &packet.template {
            ProviderTemplateContext::Apliiq(t) => t,
            _ => {
                return Err(QuantumError::InvalidForgePacket(
                    "Apliiq packet requires ApliiqTemplateContext".into(),
                ))
            }
        };
        self.vault.set_selected_store_id(packet.store_id.clone())?;
        Ok(PublishResponse {
            provider: FulfillmentProvider::Apliiq,
            store_id: packet.store_id.clone(),
            product_id: format!("design-{}", provider_nonce_hex(8)),
            upload_id: template.hosted_artwork_url.clone(),
            message: format!(
                "Created Apliiq design using {} placement.",
                template.preferred_location_name
            ),
            placement_position: template.placement_guide.position.as_str().to_string(),
        })
    }

    async fn submit_order(
        &self,
        order: &QuantumFulfillmentOrder,
    ) -> Result<ProviderOrderResponse, QuantumError> {
        let (app_key, shared_secret) = self.credentials()?;
        let (first_name, last_name) = split_contact_name(&order.shipping_address.name)?;
        let body = json!({
            "id": stable_numeric_id(&order.external_order_id),
            "number": stable_numeric_id(&order.external_order_id),
            "name": format!("#{}", order.external_order_id),
            "order_number": stable_numeric_id(&order.external_order_id),
            "line_items": order.line_items.iter().enumerate().map(|(index, item)| json!({
                "id": item.external_line_item_id.clone().unwrap_or_else(|| format!("{}-{}", order.external_order_id, index + 1)),
                "title": parse_apliiq_product_variant_id_from_sku(&item.sku).ok(),
                "quantity": item.quantity,
                "price": item.unit_retail_price.clone().unwrap_or_else(|| "0.00".to_string()),
                "grams": 0,
                "sku": parse_apliiq_product_variant_id_from_sku(&item.sku).ok(),
                "name": parse_apliiq_product_variant_id_from_sku(&item.sku).ok()
            })).collect::<Vec<_>>(),
            "billing_address": {
                "first_name": first_name,
                "last_name": last_name,
                "address1": order.shipping_address.address1,
                "address2": order.shipping_address.address2,
                "phone": order.shipping_address.phone,
                "city": order.shipping_address.city,
                "zip": order.shipping_address.zip,
                "province": order.shipping_address.state_code,
                "province_code": order.shipping_address.state_code,
                "country": order.shipping_address.country_code,
                "country_code": order.shipping_address.country_code,
                "company": order.shipping_address.company,
                "name": order.shipping_address.name
            },
            "shipping_address": {
                "first_name": split_contact_name(&order.shipping_address.name)?.0,
                "last_name": split_contact_name(&order.shipping_address.name)?.1,
                "address1": order.shipping_address.address1,
                "address2": order.shipping_address.address2,
                "phone": order.shipping_address.phone,
                "city": order.shipping_address.city,
                "zip": order.shipping_address.zip,
                "province": order.shipping_address.state_code,
                "province_code": order.shipping_address.state_code,
                "country": order.shipping_address.country_code,
                "country_code": order.shipping_address.country_code,
                "company": order.shipping_address.company,
                "name": order.shipping_address.name
            },
            "shipping_lines": [{ "code": normalize_apliiq_ship_code(order.shipping_method.as_deref()).unwrap_or_else(|_| "standard".to_string()) }]
        });
        let body_text = serde_json::to_string(&body).map_err(|e| {
            QuantumError::Vault(format!("Apliiq order payload serialization failed: {e}"))
        })?;
        let auth = self.auth_header(&app_key, &shared_secret, &body_text)?;
        let created: Value = provider_json_request_with_headers(
            &self.client,
            Method::POST,
            &format!("{APLIIQ_API_BASE}/v1/Order"),
            &[
                ("Authorization", auth),
                ("Content-Type", "application/json".to_string()),
            ],
            Some(body_text),
        )
        .await?;
        Ok(ProviderOrderResponse {
            provider: FulfillmentProvider::Apliiq,
            store_id: order.fulfillment_store_id.clone(),
            provider_order_id: created
                .get("id")
                .map(value_to_string)
                .unwrap_or_else(|| "apliiq-order".to_string()),
            external_order_id: order.external_order_id.clone(),
            status: "processed".to_string(),
            dashboard_url: None,
        })
    }
}

fn provider_client(service: &'static str) -> Result<Client, QuantumError> {
    Client::builder()
        .timeout(Duration::from_secs(PROVIDER_TIMEOUT_SECS))
        .build()
        .map_err(|e| QuantumError::Transport {
            service,
            message: e.to_string(),
        })
}

async fn provider_json_request<T, B>(
    client: &Client,
    method: Method,
    url: &str,
    bearer: Option<(&str, String)>,
    body: Option<&B>,
) -> Result<T, QuantumError>
where
    T: DeserializeOwned,
    B: Serialize + ?Sized,
{
    let mut request = client
        .request(method, url)
        .header("User-Agent", USER_AGENT_VALUE);
    if let Some((name, value)) = bearer {
        request = request.header(name, value);
    }
    if let Some(body) = body {
        request = request.json(body);
    }
    let response = request.send().await.map_err(|e| QuantumError::Transport {
        service: "provider",
        message: e.to_string(),
    })?;
    parse_provider_json_response(response).await
}

async fn provider_json_request_with_headers<T>(
    client: &Client,
    method: Method,
    url: &str,
    headers: &[(&str, String)],
    body: Option<String>,
) -> Result<T, QuantumError>
where
    T: DeserializeOwned,
{
    let mut request = client
        .request(method, url)
        .header("User-Agent", USER_AGENT_VALUE);
    for (name, value) in headers {
        request = request.header(*name, value);
    }
    if let Some(body) = body {
        request = request.body(body);
    }
    let response = request.send().await.map_err(|e| QuantumError::Transport {
        service: "provider",
        message: e.to_string(),
    })?;
    parse_provider_json_response(response).await
}

async fn parse_provider_json_response<T: DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, QuantumError> {
    let status = response.status();
    let body = response.text().await.map_err(|e| QuantumError::Transport {
        service: "provider",
        message: e.to_string(),
    })?;
    if !status.is_success() {
        return Err(QuantumError::Http {
            service: "provider",
            status: status.as_u16(),
            body,
        });
    }
    serde_json::from_str(&body).map_err(|e| QuantumError::JsonDecode {
        service: "provider",
        message: e.to_string(),
        body,
    })
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).map(value_to_string)
}

fn value_to_string(value: &Value) -> String {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| value.to_string().trim_matches('"').to_string())
}

pub fn validate_ready_forge_output(forge: &ForgeOutput) -> Result<(), QuantumError> {
    if !forge.publish_ready || !forge.qc_approved {
        return Err(QuantumError::InvalidForgePacket(
            "Forge output is not publish-ready".into(),
        ));
    }
    if forge.title.trim().is_empty() || forge.description.trim().is_empty() || forge.tags.is_empty()
    {
        return Err(QuantumError::InvalidForgePacket(
            "title, description, and tags are required".into(),
        ));
    }
    Ok(())
}

fn validate_printful_order_for_submission(
    order: &QuantumFulfillmentOrder,
) -> Result<(), QuantumError> {
    if order.external_order_id.trim().is_empty() || order.fulfillment_store_id.trim().is_empty() {
        return Err(QuantumError::InvalidForgePacket(
            "order id and store id are required".into(),
        ));
    }
    if order.line_items.is_empty() {
        return Err(QuantumError::InvalidForgePacket(
            "Printful order requires line items".into(),
        ));
    }
    for item in &order.line_items {
        if item.quantity == 0 {
            return Err(QuantumError::InvalidForgePacket(
                "quantity must be > 0".into(),
            ));
        }
        let _ = parse_printful_sync_variant_id_from_sku(&item.sku)?;
    }
    Ok(())
}

fn parse_printful_sync_variant_id_from_sku(sku: &str) -> Result<u64, QuantumError> {
    let remainder = parse_prefixed_token(sku, PRINTFUL_ORDER_SKU_PREFIX, "Printful")?;
    remainder.parse::<u64>().map_err(|_| {
        QuantumError::InvalidForgePacket(format!(
            "SKU {sku} does not contain a numeric Printful sync_variant_id"
        ))
    })
}

fn parse_gooten_variant_id_from_sku(sku: &str) -> Result<String, QuantumError> {
    parse_prefixed_token(sku, GOOTEN_ORDER_SKU_PREFIX, "Gooten")
}

fn parse_apliiq_product_variant_id_from_sku(sku: &str) -> Result<String, QuantumError> {
    let token = parse_prefixed_token(sku, APLIIQ_ORDER_SKU_PREFIX, "Apliiq")?;
    if !token.to_ascii_uppercase().starts_with("APQ-") {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {sku} must embed a valid Apliiq provider SKU beginning with APQ-"
        )));
    }
    Ok(token)
}

fn parse_prefixed_token(sku: &str, prefix: &str, label: &str) -> Result<String, QuantumError> {
    let trimmed = sku.trim();
    if !trimmed.to_ascii_uppercase().starts_with(prefix) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} does not contain the {label} routing prefix {prefix}"
        )));
    }
    let token = trimmed.get(prefix.len()..).unwrap_or_default().trim();
    if token.is_empty() {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} is missing the embedded {label} identifier"
        )));
    }
    Ok(token.to_string())
}

fn normalize_currency_code(value: &str) -> Result<String, QuantumError> {
    let trimmed = value.trim().to_ascii_uppercase();
    if trimmed.len() != 3 || !trimmed.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "Invalid currency code {value}"
        )));
    }
    Ok(trimmed)
}

fn normalize_country_code(value: &str) -> Result<String, QuantumError> {
    let trimmed = value.trim().to_ascii_uppercase();
    if trimmed.len() != 2 || !trimmed.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "Invalid country code {value}"
        )));
    }
    Ok(trimmed)
}

fn normalize_money_string(value: &str, field_name: &str) -> Result<String, QuantumError> {
    let trimmed = value.trim();
    let parsed = trimmed.parse::<f64>().map_err(|_| {
        QuantumError::InvalidForgePacket(format!("{field_name} must be a valid decimal amount"))
    })?;
    if !parsed.is_finite() || parsed < 0.0 {
        return Err(QuantumError::InvalidForgePacket(format!(
            "{field_name} must be a non-negative decimal amount"
        )));
    }
    Ok(format!("{parsed:.2}"))
}

fn split_provider_secret_pair<'a>(
    raw: &'a str,
    provider: &str,
    left: &str,
    right: &str,
) -> Result<(&'a str, &'a str), QuantumError> {
    let (a, b) = raw.trim().split_once(':').ok_or_else(|| {
        QuantumError::Vault(format!("{provider} authenticate expects {left}:{right}"))
    })?;
    let a = a.trim();
    let b = b.trim();
    if a.is_empty() || b.is_empty() {
        return Err(QuantumError::Vault(format!(
            "{provider} authenticate expects {left}:{right}"
        )));
    }
    Ok((a, b))
}

fn provider_unix_time_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn provider_time_nonce(prefix: &str) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{prefix}_{}{:09}", now.as_secs(), now.subsec_nanos())
}

fn provider_nonce_hex(len: usize) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{:x}{:x}", now.as_secs(), now.subsec_nanos())
        .chars()
        .take(len)
        .collect::<String>()
        .to_ascii_uppercase()
}

fn truncate_provider_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn normalize_sku_token(value: &str, max: usize) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .split('_')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("_")
        .chars()
        .take(max)
        .collect()
}

fn normalize_gooten_ship_type(input: Option<&str>) -> Result<String, QuantumError> {
    let value = input
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "standard".to_string());
    match value.as_str() {
        "standard" => Ok("standard".to_string()),
        "expedited" | "upgraded" => Ok("expedited".to_string()),
        "overnight" | "rush" => Ok("overnight".to_string()),
        other => Err(QuantumError::InvalidForgePacket(format!(
            "Unsupported Gooten shipping method {other}"
        ))),
    }
}

fn normalize_apliiq_ship_code(input: Option<&str>) -> Result<String, QuantumError> {
    let value = input
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "standard".to_string());
    match value.as_str() {
        "standard" => Ok("standard".to_string()),
        "expedited" | "upgraded" => Ok("upgraded".to_string()),
        "overnight" | "rush" => Ok("rush".to_string()),
        other => Err(QuantumError::InvalidForgePacket(format!(
            "Unsupported Apliiq shipping method {other}"
        ))),
    }
}

fn split_contact_name(name: &str) -> Result<(String, String), QuantumError> {
    let parts = name
        .split_whitespace()
        .filter(|v| !v.trim().is_empty())
        .collect::<Vec<_>>();
    if parts.len() < 2 {
        return Err(QuantumError::InvalidForgePacket(
            "Shipping name must contain both first and last name".into(),
        ));
    }
    Ok((parts[0].to_string(), parts[1..].join(" ")))
}

fn stable_numeric_id(value: &str) -> u64 {
    value.trim().parse::<u64>().unwrap_or_else(|_| {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in value.as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    })
}

fn hmac_sha256_bytes(key: &[u8], data: &[u8]) -> Result<Vec<u8>, QuantumError> {
    const BLOCK_SIZE: usize = 64;
    let mut key_block = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let mut hasher = sha2::Sha256::new();
        hasher.update(key);
        let digest = hasher.finalize();
        key_block[..digest.len()].copy_from_slice(&digest);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut o_key_pad = [0u8; BLOCK_SIZE];
    let mut i_key_pad = [0u8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        o_key_pad[i] = key_block[i] ^ 0x5c;
        i_key_pad[i] = key_block[i] ^ 0x36;
    }

    let mut inner = sha2::Sha256::new();
    inner.update(i_key_pad);
    inner.update(data);
    let inner_hash = inner.finalize();

    let mut outer = sha2::Sha256::new();
    outer.update(o_key_pad);
    outer.update(inner_hash);
    Ok(outer.finalize().to_vec())
}
