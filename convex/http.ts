import { httpRouter } from "convex/server";
import { webhook } from "./channels/telegram";
import { inbound } from "./channels/email";

const http = httpRouter();
http.route({ path: "/telegram/webhook", method: "POST", handler: webhook });
http.route({ path: "/email/inbound", method: "POST", handler: inbound });
export default http;
