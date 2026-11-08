
#include "buzzer.h"

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define BUZZER_PIN GPIO_NUM_27

void buzzer_init(void)
{
    gpio_reset_pin(BUZZER_PIN);
    gpio_set_direction(BUZZER_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(BUZZER_PIN, 0);
}

static void beep(int duration_ms)
{
    gpio_set_level(BUZZER_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(duration_ms));

    gpio_set_level(BUZZER_PIN, 0);
}

void buzzer_long(void)
{
    beep(500);
}

void buzzer_detected(void)
{
    beep(100);

    vTaskDelay(pdMS_TO_TICKS(120));

    beep(100);
}
