
#include "wifi_location.h"

#include <string.h>
#include "esp_wifi.h"
#include "esp_log.h"

static const char *TAG = "WIFI_LOCATION";

esp_err_t wifi_location_scan(
    wifi_fingerprint_t *result
) {
    if (result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(result, 0, sizeof(*result));

    wifi_scan_config_t scan_config = {
        .show_hidden = true,
        .scan_type = WIFI_SCAN_TYPE_ACTIVE
    };

    esp_err_t err = esp_wifi_scan_start(
        &scan_config,
        true
    );

    if (err != ESP_OK) {
        return err;
    }

    wifi_ap_record_t records[WIFI_LOCATION_MAX_APS];
    uint16_t count = WIFI_LOCATION_MAX_APS;

    err = esp_wifi_scan_get_ap_records(
        &count,
        records
    );

    if (err != ESP_OK) {
        esp_wifi_clear_ap_list();
        return err;
    }

    result->count = count;

    for (uint16_t i = 0; i < count; i++) {
        memcpy(
            result->aps[i].bssid,
            records[i].bssid,
            6
        );

        result->aps[i].rssi = records[i].rssi;
        result->aps[i].channel = records[i].primary;

        ESP_LOGI(TAG,
            "AP %u: %02X:%02X:%02X:%02X:%02X:%02X | RSSI: %d",
            i,
            records[i].bssid[0],
            records[i].bssid[1],
            records[i].bssid[2],
            records[i].bssid[3],
            records[i].bssid[4],
            records[i].bssid[5],
            records[i].rssi
        );
    }

    return ESP_OK;
}
