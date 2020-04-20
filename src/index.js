import Element                         from './components/elements.js';
import Pool                            from './common/pool.js';
import Emitter                         from 'tiny-emitter';
import computeLayout                   from 'css-layout';
import { isClick, STATE, createImage } from './common/util.js';
import parser                          from './libs/fast-xml-parser/parser.js';
import BitMapFont  from './common/bitMapFont';

// components
import {
  View, Text, Image, ScrollView, BitMapText
} from './components/index.js'

// 全局事件管道
export const EE  = new Emitter();
const imgPool    = new Pool('imgPool');
const canvasPool = new Pool('canvasPool');

const constructorMap = {
    view      : View,
    text      : Text,
    image     : Image,
    scrollview: ScrollView,
    bitmaptext: BitMapText
}

const create = function (node, style) {
    const _constructor = constructorMap[node.name];

    let children = node.children || [];

    let attr = node.attr || {};
    const id = attr.id || '';

    const args = Object.keys(attr)
        .reduce((obj, key) => {
            const value = attr[key]
            const attribute = key;

            if (key === 'id' ) {
                obj.style = Object.assign(obj.style || {}, style[id] || {})

                return obj
            }

            if (key === 'class') {
                obj.style = value.split(/\s+/).reduce((res, oneClass) => {
                return Object.assign(res, style[oneClass])
                }, obj.style || {})

                return obj
            }

            // if (/\{\{.+\}\}/.test(value)) {

            // }
            if (value === 'true') {
                obj[attribute] = true
            } else if (value === 'false') {
                obj[attribute] = false
            } else {
                obj[attribute] = value
            }

            return obj;
        }, {})

    // 用于后续元素查询
    args.idName    = id;
    args.className = attr.class || '';

    const element  = new _constructor(args)
    element.root = this;

    children.forEach(childNode => {
        const childElement = create.call(this, childNode, style);

        element.add(childElement);
    });

    return element;
}

const getChildren = (element) => Object.keys(element.children)
    .map(id => element.children[id])
    .map(child => ({
        id      : child.id,
        name    : child.name,
        style   : child.style,
        children: getChildren(child)
    }));

const renderChildren = (dataArray, children, context) => {
    dataArray.map((data) => {
        const child = children.find(item => item.id === data.id)

        if ( child.type === 'ScrollView' ) {
            // ScrollView的子节点渲染交给ScrollView自己，不支持嵌套ScrollView
            child.insertScrollView(context);
        } else {
            child.insert(context);

            return renderChildren(data.children, child.children, context);
        }
  });
}

function layoutChildren (dataArray, children) {
    dataArray.forEach((data) => {
        const child = children.find(item => item.id === data.id)

        child.layoutBox = child.layoutBox || {};

        ['left', 'top', 'width', 'height'].forEach(prop => {
            child.layoutBox[prop] = data.layout[prop];
        });

        if ( child.parent ) {
            child.layoutBox.absoluteX = (child.parent.layoutBox.absoluteX || 0) + child.layoutBox.left;
            child.layoutBox.absoluteY = (child.parent.layoutBox.absoluteY || 0) + child.layoutBox.top;
        } else {
            child.layoutBox.absoluteX = child.layoutBox.left;
            child.layoutBox.absoluteY = child.layoutBox.top;
        }

        child.layoutBox.originalAbsoluteY = child.layoutBox.absoluteY;

         // 滚动列表的画板尺寸和主画板保持一致
        if ( child.type === 'ScrollView' ) {
            child.updateRenderPort(this.renderport);
        }

        layoutChildren.call(this, data.children, child.children );
    });
}

const updateRealLayout = (dataArray, children, scale) => {
    dataArray.forEach((data) => {
        const child = children.find(item => item.id === data.id)

        child.realLayoutBox = child.realLayoutBox || {};

        ['left', 'top', 'width', 'height'].forEach(prop => {
            child.realLayoutBox[prop] = data.layout[prop] * scale;
        });

        if ( child.parent ) {
            child.realLayoutBox.realX = (child.parent.realLayoutBox.realX || 0) + child.realLayoutBox.left;
            Object.defineProperty(child.realLayoutBox, 'realY', {
                configurable: true,
                enumerable  : true,
                get: () => {
                    let res = (child.parent.realLayoutBox.realY || 0) + child.realLayoutBox.top;

                    /**
                     * 滚动列表事件处理
                     */
                    if ( child.parent && child.parent.type === 'ScrollView' ) {
                        res -= (child.parent.top * scale);
                    }

                    return res;
                },
            });
        } else {
            child.realLayoutBox.realX = child.realLayoutBox.left;
            child.realLayoutBox.realY = child.realLayoutBox.top;
        }

        updateRealLayout(data.children, child.children, scale);
    });
}

function _getElementsById(tree, list = [], id) {
    Object.keys(tree.children).forEach(key => {
        const child = tree.children[key];

        if ( child.idName === id ) {
            list.push(child);
        }

        if ( Object.keys(child.children).length ) {
            _getElementsById(child, list, id);
        }
    });

    return list;
}

function _getElementsByClassName(tree, list = [], className) {
    Object.keys(tree.children).forEach(key => {
        const child = tree.children[key];

        if ( child.className.split(/\s+/).indexOf(className) > -1 ) {
            list.push(child);
        }

        if ( Object.keys(child.children).length ) {
            _getElementsByClassName(child, list, className);
        }
    });

    return list;
}


class _Layout extends Element {
    constructor({style, name} = {}) {
        super({style, id: 0, name});

        this.hasEventHandler = false;
        this.elementTree     = null;
        this.renderContext   = null;

        this.debugInfo  = {};
        this.renderport = {};
        this.viewport   = {};

        this.touchStart  = this.eventHandler('touchstart').bind(this);
        this.touchMove   = this.eventHandler('touchmove').bind(this);
        this.touchEnd    = this.eventHandler('touchend').bind(this);
        this.touchCancel = this.eventHandler('touchcancel').bind(this);

        this.version = '0.0.1';

        this.touchMsg = {};

        this.hasViewPortSet = false;
        this.realLayoutBox = {
            realX: 0,
            realY: 0,
        }

        this.state = STATE.UNINIT;

        this.bitMapFonts = [];
    }

    /**
     * 更新被绘制canvas的窗口信息，本渲染引擎并不关心是否会和其他游戏引擎共同使用
     * 而本身又需要支持事件处理，因此，如果被渲染内容是绘制到离屏canvas，需要将最终绘制在屏幕上
     * 的绝对尺寸和位置信息更新到本渲染引擎。
     * 其中，width为物理像素宽度，height为物理像素高度，x为距离屏幕左上角的物理像素x坐标，y为距离屏幕左上角的物理像素
     * y坐标
     */
    updateViewPort(box) {
        let bChanged = false;
        let pre = JSON.stringify(this.viewport);
        this.viewport.width  = box.width  || 0;
        this.viewport.height = box.height || 0;
        this.viewport.x      = box.x      || 0;
        this.viewport.y      = box.y      || 0;

        this.realLayoutBox = {
            realX: this.viewport.x,
            realY: this.viewport.y,
        }

        this.hasViewPortSet = true;
        if(pre !== JSON.stringify(this.viewport)){
            if(this.renderport && this.elementTree && this.children){
                updateRealLayout(this.elementTree.children, this.children, this.viewport.width / this.renderport.width);
            }
        }

    }

    init(template, style, attrValueProcessor) {
        let start = new Date();

        /*if( parser.validate(template) === true) { //optional (it'll return an object in case it's not valid)*/
        /*}*/
        let parseConfig = {
            attributeNamePrefix : "",
            attrNodeName: "attr", //default is 'false'
            textNodeName : "#text",
            ignoreAttributes : false,
            ignoreNameSpace : true,
            allowBooleanAttributes : true,
            parseNodeValue : false,
            parseAttributeValue : false,
            trimValues: true,
            parseTrueNumberOnly: false,
        }

        if (attrValueProcessor && typeof attrValueProcessor  === "function") {
            parseConfig.attrValueProcessor = attrValueProcessor;
        }

        let jsonObj = parser.parse(template, parseConfig, true);

        let xmlTree = jsonObj.children[0];

        this.debugInfo.xmlTree = new Date() - start;

        // XML树生成渲染树
        this.layoutTree = create.call(this, xmlTree, style);
        this.debugInfo.layoutTree = new Date() - start;
        this.add(this.layoutTree);

        const elementTree = {
            id: this.id,
            style: {
                width        : this.style.width,
                height       : this.style.height,
                flexDirection: 'row'
            },
            children: getChildren(this)
        }

        // 计算布局树
        computeLayout(elementTree);
        this.elementTree = elementTree;
        this.debugInfo.renderTree = new Date() - start;

        let rootEle = this.children[0];

        if ( rootEle.style.width === undefined || rootEle.style.height === undefined ) {
            console.error('Please set width and height property for root element');
        } else {
            this.renderport.width  = rootEle.style.width;
            this.renderport.height = rootEle.style.height;
        }

        this.state = STATE.INITED;
    }

    layout(context) {
        let start = new Date();

        this.renderContext = context;

        if ( this.renderContext ) {
            this.renderContext.clearRect(0, 0, this.renderport.width, this.renderport.height);
        }

        if ( !this.hasViewPortSet ) {
            console.error('Please invoke method `updateViewPort` before method `layout`' );
        }

        layoutChildren.call(this, this.elementTree.children, this.children);

        this.debugInfo.layoutChildren = new Date() - start;


        // 计算真实的物理像素位置，用于事件处理
        updateRealLayout(this.elementTree.children, this.children, this.viewport.width / this.renderport.width);

        this.debugInfo.updateRealLayout = new Date() - start;

        renderChildren(this.elementTree.children, this.children, context);

        this.debugInfo.renderChildren = new Date() - start;

        this.bindEvents();

        this.state = STATE.RENDERED;
    }

    getChildByPos(tree, x, y) {
        let list = Object.keys(tree.children);

        for ( let i = 0; i < list.length;i++ ) {
            const child = tree.children[list[i]];
            const box   = child.realLayoutBox;

            if (   ( box.realX <= x && x <= box.realX + box.width  )
                && ( box.realY <= y && y <= box.realY + box.height ) ) {
                if ( Object.keys(child.children).length ) {
                    return this.getChildByPos(child, x, y);
                } else {
                    return child;
                }
            }
        }

        return tree;
    }

    eventHandler(eventName) {
        return function touchEventHandler(e) {
            if ( !this.elementTree ) {
                return;
            }

            const touch = (e.touches && e.touches[0]) ||( e.changedTouches &&  e.changedTouches[0]) || e;
            if ( !touch || !touch.pageX || !touch.pageY ) {
                return;
            }

            if ( !touch.timeStamp )  {
                touch.timeStamp = e.timeStamp;
            }

            const item  = touch && this.getChildByPos(this, touch.pageX, touch.pageY);

            item && item.emit(eventName, e);

            if ( eventName === 'touchstart' || eventName === 'touchend' ) {
                this.touchMsg[eventName] = touch;
            }

            if ( eventName === 'touchend' && isClick(this.touchMsg) ) {
                item && item.emit('click', e);
            }
        }
    }

    bindEvents() {
        if ( this.hasEventHandler ) {
            return;
        }

        this.hasEventHandler = true;

        if ( typeof wx !== 'undefined' ) {
            wx.onTouchStart(this.touchStart);
            wx.onTouchMove(this.touchMove);
            wx.onTouchEnd(this.touchEnd);
            wx.onTouchCancel(this.touchCancel);
        } else {
            document.onmousedown  = this.touchStart;
            document.onmousemove  = this.touchMove;
            document.onmouseup    = this.touchEnd;
            document.onmouseleave = this.touchEnd;
        }
    }

    emit(event, data) {
        EE.emit(event, data);
    }

    on(event, callback) {
        EE.on(event, callback)
    }

    once(event, callback) {
        EE.once(event, callback)
    }

    off(event, callback) {
        EE.off(event, callback)
    }

    getElementsById(id) {
       return _getElementsById(this, [], id);
    }

    getElementsByClassName(className) {
        return _getElementsByClassName(this, [], className);
    }

    destroyAll(tree) {
        if ( !tree ) {
            tree = this;
        }

        const children = tree.children;

        Object.keys(children).forEach( id => {
            const child = children[id];

            child.destroy();

            this.destroyAll(child);

            child.destroySelf && child.destroySelf();
        });
    }

    clear() {
        this.destroyAll();
        this.elementTree = null;
        this.children    = [];
        this.layoutTree  = {};
        this.state       = STATE.CLEAR;
        Object.keys(canvasPool.pool).forEach(key => {
            let item = canvasPool.get(key);
            item.context && item.context.clearRect(0, 0, item.canvas.width, item.canvas.height);
            item.elements = [];

            item.canvas  = null;
            item.context = null;
        })

        if ( this.renderContext ) {
            this.renderContext.clearRect(0, 0, this.renderContext.canvas.width, this.renderContext.canvas.height);
        }

        ['touchstart', 'touchmove', 'touchcancel', 'touchend', 'click', 'repaint'].forEach(eventName => {
            this.off(eventName);
        });

        this.EE.off('image__render__done');
    }

    clearPool() {
        imgPool.clear();
        canvasPool.clear();
    }

    clearAll() {
        this.clear();

        this.clearPool();
    }

    loadImgs(arr) {
        arr.forEach( src => {
            let img = createImage();

            imgPool.set(src, img);

            img.onload = () => {
                img.loadDone = true;
            }

            img.onloadcbks = [];
            img.src = src;
        });
    }

    registBitMapFont(name, src, config) {
        const font = new BitMapFont(name, src, config)
        this.bitMapFonts.push(font)
    }
}

let Layout = new _Layout({
    style: {
        width : 0,
        height: 0,
    },
    name: 'layout'
});

export default Layout;
