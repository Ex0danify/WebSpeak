<script setup lang="ts">
import { ToolbarButton } from "reka-ui";

// Makes the one element in the slot (a Button, a menu trigger) a stop of the surrounding Toolbar, with the arrow keys.
</script>

<template>
  <ToolbarButton as-child><slot /></ToolbarButton>
</template>
