const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
  entry: {
    task: path.resolve('./src/extension/webview/task/main.ts'),
    artifact: path.resolve('./src/extension/webview/artifact/main.ts'),
    gantt: path.resolve('./src/extension/webview/gantt/main.ts')
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve('./dist/webview'),
    publicPath: ''
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.ts$/,
        // only compile TypeScript under src/extension for webview bundles
        include: [path.resolve(__dirname, 'src', 'extension')],
        use: [
          {
            loader: 'ts-loader',
            options: {
              // use a webview-specific tsconfig to limit what tsc emits
              configFile: path.resolve(__dirname, 'tsconfig.webview.json'),
              // ensure .vue files are processed by ts-loader for TS parts
              appendTsSuffixTo: [/\.vue$/]
            }
          }
        ]
      },
      
      {
        test: /\.js$/,
        // only process JS under src/extension to avoid picking up compiled server code in out/
        include: [path.resolve(__dirname, 'src', 'extension')],
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      filename: 'task.html',
      chunks: ['task'],
      templateContent: () => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Task</title></head><body><div id="app"></div></body></html>'
    }),
    new HtmlWebpackPlugin({
      filename: 'artifact.html',
      chunks: ['artifact'],
      templateContent: () => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artifact</title></head><body><div id="app"></div></body></html>'
    }),
    new HtmlWebpackPlugin({
      filename: 'gantt.html',
      chunks: ['gantt'],
      templateContent: () => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gantt</title></head><body><div id="app"></div></body></html>'
    })
  ],
  resolve: {
    extensions: ['.ts', '.js', '.vue'],
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js'
    },
    fallback: {
      assert: false
    }
  }
};
