const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
  entry: {
    task: path.resolve('./src/extension/webview/task/main.js'),
    artifact: path.resolve('./src/extension/webview/artifact/main.js')
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
        test: /\.js$/,
        exclude: /node_modules/,
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
    })
  ],
  resolve: {
    extensions: ['.js', '.vue'],
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js'
    }
  }
};
