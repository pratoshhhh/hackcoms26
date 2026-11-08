"""Device report published by the ESP32 firmware."""

from pydantic import BaseModel, ConfigDict, Field


class DeviceReport(BaseModel):
    """MQTT body from the hydrant node.

    {
      "deviceId": "ESP001",
      "hydrantId": "H101",
      "sequence": 24,
      "sideDistanceCm": 150.0,
      "snowDistanceCm": 40.0
    }
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    device_id: str = Field(alias="deviceId", min_length=1)
    hydrant_id: str = Field(alias="hydrantId", min_length=1)
    sequence: int = Field(ge=0)
    side_distance_cm: float = Field(alias="sideDistanceCm")
    snow_distance_cm: float = Field(alias="snowDistanceCm")
