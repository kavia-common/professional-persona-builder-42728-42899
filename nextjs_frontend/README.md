
  # 2-Step Career Navigator UI

  This is a code bundle for 2-Step Career Navigator UI. The original project is available at https://www.figma.com/design/fOfmhhDzaqnVoFiefAcX5o/2-Step-Career-Navigator-UI.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ### Troubleshooting

  If `npm run dev`, `npm run build`, or `npm run preview` fails with an error like:

  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../node_modules/vite/dist/node/cli.js`

  it usually means `node_modules` is in a corrupted/partial state (the `vite/dist` folder is missing).
  Fix it by doing a clean reinstall:

  - `rm -rf node_modules package-lock.json`
  - `npm install` (or `npm ci` if you have an existing lockfile)
  