import { StaticMesh } from "./StaticMesh";
import { Entity } from "../../core/Entity";
import { GraphicUpdateResult } from "./Geometry";
import { SerializableMatrix44 } from "../../math/Matrix44";
import { Transform } from "../../core/Transform";
import { VertexBuffer } from "../VertexBuffer";
import { Camera } from "../Camera";
import { Shader } from "../Shader";
import { MemoryTexture } from "../MemoryTexture";
export declare class SkinnedMesh extends StaticMesh {
    static skeletonPropertyKey: string;
    skeleton: Entity | null;
    bindMatrix: SerializableMatrix44;
    readonly bindMatrixInverse: SerializableMatrix44;
    readonly boneTexture: MemoryTexture;
    readonly boneTextureSize: number;
    readonly boneMatrices: Float32Array;
    boneFbxIds: number[];
    private _skeleton;
    private _bindMatrix;
    private _bindMatrixInverse;
    private _boneFbxIds;
    private _vb;
    private _boneTexture;
    private _boneTextureSize;
    private _boneMatrices;
    private _boneInverses;
    private _bones;
    constructor();
    getVertexBuffer(): VertexBuffer | null;
    graphicUpdate(camera: Camera, shader: Shader, buckedId: string, transform: Transform, deltaTime: number): GraphicUpdateResult;
    destroy(): void;
    private updateMatrices;
}
