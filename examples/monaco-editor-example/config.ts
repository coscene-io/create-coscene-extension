const path = require("path");
const webpack = require("webpack");

module.exports = {
  webpack: (config) => {
    // Inlined worker source maps would otherwise duplicate the editor payload in production.
    if (config.mode === "production") config.devtool = false;
    config.module.rules = [
      {
        test: /monaco-editor[\\/]esm[\\/].*[\\/](defaultWorkerFactory|editor\.api)\.js$/,
        loader: path.resolve(__dirname, "monacoEnvironmentLoader.cjs"),
      },
      {
        test: /\.worker\.js$/,
        include: path.resolve(__dirname, "src"),
        loader: "worker-loader",
        options: { inline: "no-fallback" },
      },
      { test: /\.ttf$/, type: "asset/inline" },
      ...config.module.rules,
    ];
    // A .coe evaluates one entry point; keep TypeScript's lazy mode in that bundle too.
    config.plugins.push(new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }));
    return config;
  },
};
