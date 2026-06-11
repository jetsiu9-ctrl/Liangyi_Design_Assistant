/**
 * 颜色按钮组件模块
 * 创建和管理颜色按钮元素
 */

function rgbToHex(rgbString) {
    const match = rgbString.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (!match) return '#000000';

    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
}

function isLightColor(rgbString) {
    const match = rgbString.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (!match) return false;

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.7;
}

class ColorButton {
    constructor(color, options = {}) {
        this.color = color;
        this.options = {
            deletable: false,
            index: -1,
            onClick: () => {},
            onRightClick: () => {},
            ...options
        };
        this.element = null;
        this._createElement();
    }

    _createElement() {
        this.element = document.createElement('button');
        this.element.className = 'color-btn';

        if (this.options.deletable) {
            this.element.classList.add('deletable');
        }

        const bgColor = rgbToHex(this.color);
        this.element.style.backgroundColor = bgColor;

        if (isLightColor(this.color)) {
            this.element.classList.add('light-color');
        }

        if (this.options.deletable) {
            const deleteIndicator = document.createElement('span');
            deleteIndicator.className = 'delete-indicator';
            deleteIndicator.textContent = '×';
            this.element.appendChild(deleteIndicator);
        }

        this.element.title = this.color;

        this.element.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.options.onClick(this.color, this.options.index);
        });

        if (this.options.deletable) {
            this.element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.options.onRightClick(this.color, this.options.index);
            });
        }
    }

    setSelected(selected) {
        if (selected) {
            this.element.classList.add('selected');
        } else {
            this.element.classList.remove('selected');
        }
    }

    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
    }

    getElement() {
        return this.element;
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }
}

function createColorButton(color, options) {
    return new ColorButton(color, options);
}

function renderColorButtons(container, colors, options = {}) {
    const buttons = [];

    if (!container) return buttons;

    container.innerHTML = '';

    colors.forEach((color, index) => {
        const btnOptions = {
            ...options,
            index: options.startIndex ? options.startIndex + index : index
        };
        const button = createColorButton(color, btnOptions);
        container.appendChild(button.getElement());
        buttons.push(button);
    });

    return buttons;
}
