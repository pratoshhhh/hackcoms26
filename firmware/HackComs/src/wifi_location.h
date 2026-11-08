
#ifndef WIFI_LOCATION_H
#define WIFI_LOCATION_H

#include <stdint.h>
#include "esp_err.h"

#define WIFI_LOCATION_MAX_APS 12

typedef struct {
    uint8_t bssid[6];
    int8_t rssi;
    uint8_t channel;
} wifi_location_ap_t;

typedef struct {
    wifi_location_ap_t aps[WIFI_LOCATION_MAX_APS];
    uint16_t count;
} wifi_fingerprint_t;

esp_err_t wifi_location_scan(
    wifi_fingerprint_t *result
);

#endif
