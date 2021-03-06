// @ts-ignore
import VueSocketIO from "vue-socket.io";
import Vue from "vue";

const socket = new VueSocketIO({
    connection: process.env.VUE_APP_API_URL || (window as any).appConfig.VUE_APP_API_URL
});

Vue.use(socket);
