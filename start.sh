#!/bin/bash
export GEMINI_API_KEYS="AIzaSyCcUoaL4B2EZ3lIte3_hJSM5HEsbFbCUgk,AIzaSyDri4E21oIhLsj-FsDMY4VpYHcFWX9CIDM,AIzaSyAgvBH8D2G-8VFjtgNGsTHXJj0UYbXa1Ag,AIzaSyCYXJk-EAz6b1M-XJ7s5msgpnNXkkr3NVA"
export GEMINI_API_KEY="AIzaSyCcUoaL4B2EZ3lIte3_hJSM5HEsbFbCUgk"
export GEMINI_MODEL="gemini-2.5-flash"
export DATABASE_URL="file:/root/mp-expert/db/custom.db"
export HOSTNAME="0.0.0.0"
export PORT=3008
export NODE_ENV="production"
exec node /root/mp-expert/.next/standalone/server.js
