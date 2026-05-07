use crate::models::QuantumError;
use crate::neural::egress_controller::MmapSentinelReader;

pub struct FlatlineTelemetry {
    reader: MmapSentinelReader,
}

impl FlatlineTelemetry {
    pub fn open() -> Result<Self, QuantumError> {
        Ok(Self {
            reader: MmapSentinelReader::open()?,
        })
    }

    pub fn flatline_active(&self) -> bool {
        !self.reader.heartbeat_alive()
    }
}
