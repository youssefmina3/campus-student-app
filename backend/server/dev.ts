import { app, config } from './app.js';
app.listen(config.PORT, '127.0.0.1', () => {
  console.log('API running at http://127.0.0.1:' + config.PORT);
});
