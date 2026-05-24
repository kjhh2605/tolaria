<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { onBeforeUnmount, onMounted, watchEffect } from "vue";
import { useData } from "vitepress";

const { frontmatter } = useData();
const scrollClass = "hs-hub-scrolled";
const landingPageClass = "hs-hub-landing-page";

const updateScrollClass = () => {
  document.documentElement.classList.toggle(scrollClass, window.scrollY > 8);
};

watchEffect(() => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle(
    landingPageClass,
    Boolean(frontmatter.value.landing),
  );
});

onMounted(() => {
  updateScrollClass();
  window.addEventListener("scroll", updateScrollClass, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", updateScrollClass);
  document.documentElement.classList.remove(scrollClass);
  document.documentElement.classList.remove(landingPageClass);
});
</script>

<template>
  <div :class="{ 'hs-hub-landing-shell': frontmatter.landing }">
    <DefaultTheme.Layout />
  </div>
</template>
