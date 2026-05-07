module.exports = {
  apps: [{
    name: 'mp-expert',
    script: '/root/mp-expert/start.sh',
    interpreter: 'bash',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
  }]
};
