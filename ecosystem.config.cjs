module.exports = {
  apps: [
    {
      name: "khetisense",
      script: "server.js",
      instances: 1, // 1 instance is recommended so the background alert watcher doesn't duplicate alerts
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0"
      }
    }
  ]
};
