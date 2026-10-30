FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# No dependencies to install: the server uses Node.js built-in modules only.
COPY --chown=node:node package.json server.mjs index.html style.css app.js engine.js world.js camera.js network.js multiplayer.js favicon.svg ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "const http=require('node:http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/'},res=>{res.resume();process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.setTimeout(3000,()=>{req.destroy();process.exit(1)})"

CMD ["node", "server.mjs"]
