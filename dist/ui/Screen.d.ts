import { Entity } from "../core/Entity";
import { Layout } from "./Layout";
import { Material } from "../graphics/Material";
import { Matrix44 } from "../math/Matrix44";
import { Vector2 } from "../math/Vector2";
import { SerializedObject } from "../core/SerializableObject";
import { Resolution } from "./Resolution";
import { Component } from "../core/Component";
/**
 * @hidden
 */
export interface CacheEntry {
    drawOrder: number;
    element: Layout;
}
export declare class Screen extends Component {
    readonly version: number;
    readonly cache: CacheEntry[];
    readonly cacheSize: number;
    readonly offset: Vector2;
    readonly translationX: number;
    readonly translationY: number;
    readonly scale: number;
    readonly screenTransform: Matrix44;
    readonly resolution: Resolution | undefined;
    private _resolution;
    private _integerPixels;
    private _cache;
    private _cacheIndex;
    private _offset;
    private _translationX;
    private _translationY;
    private _scale;
    private _pressedElement?;
    private _pressDuration;
    private _initialTouchPos;
    private _screenTransform;
    setEntity(owner: Entity): void;
    destroy(): void;
    getResolution(fallback: Vector2): Vector2;
    updateTransforms(): void;
    update(): void;
    render(uiMaterial: Material): void;
    upgrade(json: SerializedObject, previousVersion: number): SerializedObject;
    private addToCache;
    private onTouchPressed;
    private onTouchMoved;
    private onTouchReleased;
    private onTouchChanged;
    private onEvent;
    private onElementHovered;
}
