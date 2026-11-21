import { createApp } from "./app.js";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { mountFrontend } from "./staticAssets.js";

const app = createApp();

await mountFrontend(app);

app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(
    `Message uploader is running at http://${config.host}:${config.port}`
  );
});
