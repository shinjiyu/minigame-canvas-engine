import Element from './elements.js';

export default class View extends Element {
    constructor({
        style={},
        props={},
        idName='',
        className='',
    }) {
        super({
            props,
            idName,
            className,
            style,
        });

        this.type = 'View';
        this.ctx  = null;
        this.renderBoxes = [];
    }

    destroySelf() {
        this.isDestroyed  = true;
        this.children     = null;
    }

    // 有些节点仅仅作为容器，实际上不需要任何渲染逻辑，这里加个判断可以提高性能
    checkNeedRender() {
        const style       = this.style || {};
        const borderColor = style.borderColor;

        return !!(   style.backgroundColor
                  || ( style.borderWidth       && borderColor)
                  || ( style.borderTopWidth    && ( borderColor  || style.borderTopColor    ) )
                  || ( style.borderBottomWidth && ( borderColor  || style.borderBottomColor ) )
                  || ( style.borderLeftWidth   && ( borderColor  || style.borderLeftColor   ) )
                  || ( style.borderRightWidth  && ( borderColor  || style.borderRightColor  ) )  );
    }

    render(ctx, layoutBox) {
        const style = this.style || {};
        const box = layoutBox || this.layoutBox;

        ctx.save()

        const borderWidth = style.borderWidth || 0;
        let drawX         = box.absoluteX;
        let drawY         = box.absoluteY;

        const borderLeftWidth   = style.borderLeftWidth   || borderWidth;
        const borderRightWidth  = style.borderRightWidth  || borderWidth;
        const borderTopWidth    = style.borderTopWidth    || borderWidth;
        const borderBottomWidth = style.borderBottomWidth || borderWidth;

        this.renderBorder(ctx, layoutBox);

        if ( style.backgroundColor ) {
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(
                drawX + borderLeftWidth,
                drawY + borderRightWidth,
                box.width - (borderLeftWidth + borderRightWidth),
                box.height - (borderTopWidth + borderBottomWidth)
            )
        }

        ctx.restore();
    }

    insert(ctx, box) {
        this.ctx = ctx;

        if ( !box ) {
            box = this.layoutBox;
        }

        this.renderBoxes.push({ ctx, box });

        this.render(ctx, box)
    }

    repaint() {
        this.renderBoxes.forEach( item => {
            this.render(item.ctx, item.box);
        });
    }
}
