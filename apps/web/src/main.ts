import { createApp } from "vue";
import "element-plus/dist/index.css";

import App from "@/app/App.vue";
import { router } from "@/app/router";
import { pinia } from "@/app/state";
import "@/shared/styles/base.css";

createApp(App).use(pinia).use(router).mount("#app");
