
#ifndef MQTT_SERVICE_H
#define MQTT_SERVICE_H

#include <stdbool.h>
#include "esp_err.h"

void mqtt_service_init(
    const char *broker_uri,
    const char *username,
    const char *password
);

bool mqtt_service_is_connected(void);

esp_err_t mqtt_service_publish(
    const char *topic,
    const char *json
);

#endif
