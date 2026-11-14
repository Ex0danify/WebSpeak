<script setup lang="ts">
import { ToolbarButton as RekaToolbarButton } from "reka-ui";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";

// An icon button in a Toolbar. `label` is its accessible name and its tooltip, `shortcut` is shown beside it. Other attributes
// (disabled, click handlers) go to the button. For a control with a visible text, use ToolbarItem around a Button instead.
defineOptions({ inheritAttrs: false });
defineProps<{ label: string; shortcut?: string }>();
</script>

<template>
  <Tooltip :text="label" :shortcut="shortcut">
    <RekaToolbarButton as-child>
      <Button v-bind="$attrs" variant="soft" size="sm" icon-only :aria-label="label"><slot /></Button>
    </RekaToolbarButton>
  </Tooltip>
</template>
