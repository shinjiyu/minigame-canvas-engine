var path    = require('path');
var webpack = require('webpack');
let uglify = require('uglifyjs-webpack-plugin');

module.exports = {
    entry:{
       'demos/pixijs/sub/engine': './src/index',
       'demos/webgl/libs/engine': './src/index',
       'demos/interactivedemo/sub/engine': './src/index',
       'demos/cocoscreator/build/wechatgame/sub/engine': './src/index',
       './index': './src/index',
    },
    output:{
        path: path.resolve(__dirname, ''),
        filename: '[name].js',
        libraryTarget: 'commonjs2'
    },
    module: {
        rules: [
            {
            test: /\.js$/,
            exclude: /(node_modules|bower_components)/,
            use: {
                loader: 'babel-loader',
                options: {
                presets: ['@babel/preset-env']
                }
            },
            }
        ]
    },
    plugins: [
		new uglify()
    ],
    mode: 'none',
};
