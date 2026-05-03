use crate::models::*;
use crate::providers::{
    ApliiqGateway, GootenGateway, PrintfulGateway, ProviderGateway, APLIIQ_ORDER_SKU_PREFIX,
    GOOTEN_ORDER_SKU_PREFIX, PRINTFUL_ORDER_SKU_PREFIX,
};
use std::sync::Arc;

pub struct OrderRouter {
    printful: Arc<PrintfulGateway>,
    gooten: Arc<GootenGateway>,
    apliiq: Arc<ApliiqGateway>,
}

impl OrderRouter {
    pub fn new(
        printful: Arc<PrintfulGateway>,
        gooten: Arc<GootenGateway>,
        apliiq: Arc<ApliiqGateway>,
    ) -> Self {
        Self {
            printful,
            gooten,
            apliiq,
        }
    }

    pub async fn route_and_fulfill(
        &self,
        normalized_order: QuantumFulfillmentOrder,
    ) -> Result<ProviderOrderResponse, QuantumError> {
        if normalized_order.line_items.is_empty() {
            return Err(QuantumError::InvalidForgePacket(
                "QuantumFulfillmentOrder must contain at least one line item".into(),
            ));
        }

        let provider =
            detect_fulfillment_provider_from_sku(normalized_order.line_items[0].sku.as_str())?;
        ensure_single_provider_prefix(&normalized_order, provider)?;

        match provider {
            FulfillmentProvider::Printful => {
                ensure_printful_order_is_complete(&normalized_order)?;
                self.printful.submit_order(&normalized_order).await
            }
            FulfillmentProvider::Gooten => {
                ensure_gooten_order_is_complete(&normalized_order)?;
                self.gooten.submit_order(&normalized_order).await
            }
            FulfillmentProvider::Apliiq => {
                ensure_apliiq_order_is_complete(&normalized_order)?;
                self.apliiq.submit_order(&normalized_order).await
            }
            _ => Err(QuantumError::InvalidForgePacket(format!(
                "No fulfillment bridge is locked yet for provider {provider:?}"
            ))),
        }
    }
}

pub fn detect_fulfillment_provider_from_sku(
    sku: &str,
) -> Result<FulfillmentProvider, QuantumError> {
    let trimmed = sku.trim();
    let upper = trimmed.to_ascii_uppercase();

    if upper.starts_with(PRINTFUL_ORDER_SKU_PREFIX) {
        return Ok(FulfillmentProvider::Printful);
    }

    if upper.starts_with(GOOTEN_ORDER_SKU_PREFIX) {
        return Ok(FulfillmentProvider::Gooten);
    }

    if upper.starts_with(APLIIQ_ORDER_SKU_PREFIX) {
        return Ok(FulfillmentProvider::Apliiq);
    }

    Err(QuantumError::InvalidForgePacket(format!(
        "Unsupported fulfillment SKU prefix in {trimmed}"
    )))
}

pub fn ensure_single_provider_prefix(
    order: &QuantumFulfillmentOrder,
    expected_provider: FulfillmentProvider,
) -> Result<(), QuantumError> {
    for item in &order.line_items {
        let detected = detect_fulfillment_provider_from_sku(&item.sku)?;
        if detected != expected_provider {
            return Err(QuantumError::InvalidForgePacket(
                "Mixed-provider orders are not routable in a single callback pass".into(),
            ));
        }
    }

    Ok(())
}

pub fn ensure_printful_order_is_complete(
    order: &QuantumFulfillmentOrder,
) -> Result<(), QuantumError> {
    ensure_order_basics(order)?;

    let any_retail_price = order.line_items.iter().any(|item| {
        item.unit_retail_price
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    });

    let all_retail_prices = order.line_items.iter().all(|item| {
        item.unit_retail_price
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    });

    if any_retail_price && !all_retail_prices {
        return Err(QuantumError::InvalidForgePacket(
            "Printful retail prices must be present on every line item when one is provided".into(),
        ));
    }

    if order.retail_costs.is_some() && !all_retail_prices {
        return Err(QuantumError::InvalidForgePacket(
            "Printful retail_costs require unit_retail_price on every line item".into(),
        ));
    }

    for item in &order.line_items {
        let _ = parse_printful_sync_variant_id_from_sku(&item.sku)?;
        if let Some(value) = item.unit_retail_price.as_ref() {
            let _ = normalize_money_string(value, "line item retail_price")?;
        }
    }

    if let Some(costs) = order.retail_costs.as_ref() {
        let _ = normalize_money_string(&costs.subtotal, "retail_costs.subtotal")?;
        let _ = normalize_money_string(&costs.discount, "retail_costs.discount")?;
        let _ = normalize_money_string(&costs.shipping, "retail_costs.shipping")?;
        let _ = normalize_money_string(&costs.tax, "retail_costs.tax")?;
        if let Some(vat) = costs.vat.as_ref() {
            let _ = normalize_money_string(vat, "retail_costs.vat")?;
        }
        let _ = normalize_money_string(&costs.total, "retail_costs.total")?;
    }

    Ok(())
}

fn ensure_gooten_order_is_complete(order: &QuantumFulfillmentOrder) -> Result<(), QuantumError> {
    ensure_order_basics(order)?;

    let phone = order
        .shipping_address
        .phone
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            QuantumError::InvalidForgePacket("Gooten orders require shipping_address.phone".into())
        })?;

    let email = order
        .shipping_address
        .email
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            QuantumError::InvalidForgePacket("Gooten orders require shipping_address.email".into())
        })?;

    if phone.is_empty() || email.is_empty() {
        return Err(QuantumError::InvalidForgePacket(
            "Gooten orders require shipping_address.phone and shipping_address.email".into(),
        ));
    }

    ensure_name_is_splitable(&order.shipping_address.name)?;

    for item in &order.line_items {
        let _ = parse_gooten_variant_id_from_sku(&item.sku)?;
    }

    Ok(())
}

fn ensure_apliiq_order_is_complete(order: &QuantumFulfillmentOrder) -> Result<(), QuantumError> {
    ensure_order_basics(order)?;
    ensure_name_is_splitable(&order.shipping_address.name)?;

    let country_code = normalize_country_code(&order.shipping_address.country_code)?;
    let state_code = order
        .shipping_address
        .state_code
        .as_ref()
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            QuantumError::InvalidForgePacket(
                "Apliiq orders require shipping_address.state_code".into(),
            )
        })?;

    if country_code == "US" && state_code.len() != 2 {
        return Err(QuantumError::InvalidForgePacket(
            "Apliiq US orders require a 2-letter shipping_address.state_code".into(),
        ));
    }

    for item in &order.line_items {
        let _ = parse_apliiq_product_variant_id_from_sku(&item.sku)?;
        let retail_price = item.unit_retail_price.as_ref().ok_or_else(|| {
            QuantumError::InvalidForgePacket(
                "Apliiq orders require unit_retail_price on every line item".into(),
            )
        })?;
        let _ = normalize_money_string(retail_price, "line item retail_price")?;
    }

    Ok(())
}

fn ensure_order_basics(order: &QuantumFulfillmentOrder) -> Result<(), QuantumError> {
    if order.external_order_id.trim().is_empty() {
        return Err(QuantumError::InvalidForgePacket(
            "QuantumFulfillmentOrder.external_order_id is required".into(),
        ));
    }

    if order.fulfillment_store_id.trim().is_empty() {
        return Err(QuantumError::InvalidForgePacket(
            "QuantumFulfillmentOrder.fulfillment_store_id is required".into(),
        ));
    }

    if order.line_items.is_empty() {
        return Err(QuantumError::InvalidForgePacket(
            "QuantumFulfillmentOrder.line_items cannot be empty".into(),
        ));
    }

    if order.shipping_address.name.trim().is_empty()
        || order.shipping_address.address1.trim().is_empty()
        || order.shipping_address.city.trim().is_empty()
        || order.shipping_address.zip.trim().is_empty()
    {
        return Err(QuantumError::InvalidForgePacket(
            "QuantumFulfillmentOrder.shipping_address is missing required recipient fields".into(),
        ));
    }

    let _ = normalize_country_code(&order.shipping_address.country_code)?;
    let _ = normalize_currency_code(&order.currency)?;

    for item in &order.line_items {
        if item.quantity == 0 {
            return Err(QuantumError::InvalidForgePacket(
                "Order line item quantity must be greater than zero".into(),
            ));
        }
    }

    Ok(())
}

fn ensure_name_is_splitable(name: &str) -> Result<(), QuantumError> {
    let parts = name
        .split_whitespace()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>();

    if parts.len() < 2 {
        return Err(QuantumError::InvalidForgePacket(
            "Shipping name must contain both first and last name".into(),
        ));
    }

    Ok(())
}

fn parse_printful_sync_variant_id_from_sku(sku: &str) -> Result<u64, QuantumError> {
    let trimmed = sku.trim();
    let upper = trimmed.to_ascii_uppercase();

    if !upper.starts_with(PRINTFUL_ORDER_SKU_PREFIX) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} does not contain the Printful routing prefix {PRINTFUL_ORDER_SKU_PREFIX}"
        )));
    }

    let remainder = trimmed
        .get(PRINTFUL_ORDER_SKU_PREFIX.len()..)
        .unwrap_or_default()
        .trim();

    if remainder.is_empty() {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} is missing a Printful sync_variant_id"
        )));
    }

    remainder.parse::<u64>().map_err(|_| {
        QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} does not contain a numeric Printful sync_variant_id"
        ))
    })
}

fn parse_gooten_variant_id_from_sku(sku: &str) -> Result<String, QuantumError> {
    let trimmed = sku.trim();
    let upper = trimmed.to_ascii_uppercase();

    if !upper.starts_with(GOOTEN_ORDER_SKU_PREFIX) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} does not contain the Gooten routing prefix {GOOTEN_ORDER_SKU_PREFIX}"
        )));
    }

    let variant_id = trimmed
        .get(GOOTEN_ORDER_SKU_PREFIX.len()..)
        .unwrap_or_default()
        .trim();

    if variant_id.is_empty() {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} is missing the embedded Gooten variant identifier"
        )));
    }

    if !variant_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} contains an invalid Gooten variant identifier"
        )));
    }

    Ok(variant_id.to_string())
}

fn parse_apliiq_product_variant_id_from_sku(sku: &str) -> Result<String, QuantumError> {
    let trimmed = sku.trim();
    let upper = trimmed.to_ascii_uppercase();

    if !upper.starts_with(APLIIQ_ORDER_SKU_PREFIX) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} does not contain the Apliiq routing prefix {APLIIQ_ORDER_SKU_PREFIX}"
        )));
    }

    let variant_id = trimmed
        .get(APLIIQ_ORDER_SKU_PREFIX.len()..)
        .unwrap_or_default()
        .trim();

    if variant_id.is_empty() {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} is missing the embedded Apliiq product/variant identifier"
        )));
    }

    if !variant_id.to_ascii_uppercase().starts_with("APQ-") {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} must embed a valid Apliiq provider SKU beginning with APQ-"
        )));
    }

    if !variant_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        return Err(QuantumError::InvalidForgePacket(format!(
            "SKU {trimmed} contains an invalid Apliiq product/variant identifier"
        )));
    }

    Ok(variant_id.to_string())
}

fn normalize_currency_code(value: &str) -> Result<String, QuantumError> {
    let trimmed = value.trim().to_ascii_uppercase();
    if trimmed.len() != 3 || !trimmed.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "Invalid currency code {value}"
        )));
    }
    Ok(trimmed)
}

fn normalize_country_code(value: &str) -> Result<String, QuantumError> {
    let trimmed = value.trim().to_ascii_uppercase();
    if trimmed.len() != 2 || !trimmed.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(QuantumError::InvalidForgePacket(format!(
            "Invalid country code {value}"
        )));
    }
    Ok(trimmed)
}

fn normalize_money_string(value: &str, field_name: &str) -> Result<String, QuantumError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(QuantumError::InvalidForgePacket(format!(
            "{field_name} cannot be empty"
        )));
    }

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
