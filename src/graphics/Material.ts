
import { BlendingModes, RenderPass, CullModes } from "./GraphicTypes";
import { Asset } from "../assets/Asset";
import { Shader } from "./Shader";
import { SerializableObject, SerializedObject } from "../core/SerializableObject";
import { AssetReference, AssetChangedEvent } from "../serialization/AssetReference";
import { Debug } from "../io/Debug";
import { EngineUtils } from "../core/EngineUtils";
import * as Attributes from "../core/Attributes";
import { GraphicAsset } from "./GraphicAsset";
import { ShaderUtils, ShaderParamInstanceType } from "./ShaderUtils";
import { WebGL } from "./WebGL";
import { ObjectProps } from "../core/Types";
import { Texture2D } from "./Texture2D";
import { Texture } from "./Texture";

namespace Private {
    export const shaderParamsPropertySetter = "shaderParams";
}

/**
 * @hidden
 */
export namespace MaterialInternal {
    export const shaderPropertyKey = "_shader";
    export const shaderParamsPropertyKey = `_${Private.shaderParamsPropertySetter}`;
}

interface MaterialProps {
    shader?: Shader;
    shaderParams?: { [name: string]: ShaderParamInstanceType };
    priority?: number;
    blending?: BlendingModes;
    renderPass?: RenderPass;
    cullMode?: CullModes;
    depthTest?: boolean;
}

export class Material extends Asset {

    get version() { return 4; }

    get shader() { return this._shader.asset; }
    get blending() { return this._blending; }
    get renderPass() { return this._renderPass; }
    get cullMode() { return this._cullMode; }
    get priority() { return this._priority; }
    get shaderParams() { return this._shaderParams; }
    get depthTest() { return this._depthTest; }

    set shader(shader: Shader | null) { this._shader.asset = shader; }
    set blending(blending: BlendingModes) { this._blending = blending; }
    set renderPass(renderPass: RenderPass) { this._renderPass = renderPass; }
    set cullMode(cullMode: CullModes) { this._cullMode = cullMode; }
    set priority(priority: number) { this._priority = priority; }    
    set depthTest(depthTest: boolean) { this._depthTest = depthTest; }

    set shaderParams(paramDefinitions: SerializableObject) {
        if (!this.shader) {
            // tslint:disable-next-line
            console.error(`Cannot set property 'shaderParams' on Material because it has no shader.`);
            return;
        }

        // convert textures to AssetReference<Texture>
        const paramDeclarations = this.shader.getUniforms();
        const textureParams = Object.keys(paramDefinitions)
            .filter(definition => {
                const decl = paramDeclarations[definition];
                if (decl) {
                    return Boolean(decl.type.match(/sampler/));
                }
                return false;
            });

        textureParams.forEach(textureParam => {
            const param = paramDefinitions[textureParam];
            console.assert(param);
            const isUrl = typeof (param) === "string";
            if (isUrl) {
                paramDefinitions[textureParam] = new AssetReference(Texture, new Texture2D({ textureData: param }));
            } else if (param.isA && param.isA(Texture)) {
                paramDefinitions[textureParam] = new AssetReference(Texture, param);
            } else {
                // tslint:disable-next-line
                console.error(`Invalid sampler uniform '${textureParam}', must be an Url or a Texture object.`);
            }
        });

        this._shaderParams = ShaderUtils.buildMaterialParams(paramDeclarations, paramDefinitions, false);
        this.updateRuntimeAccessors();
    }

    get buckedId() {
        // tslint:disable-next-line
        const blendingId = 1 << this.blending;
        // tslint:disable-next-line
        const cullId = (1 << (BlendingModes.Additive + 1)) << this.cullMode;
        // tslint:disable-next-line
        const depthTestId = (1 << ((BlendingModes.Additive + 1) + (CullModes.None + 1))) << (this._depthTest ? 0 : 1);
        // tslint:disable-next-line
        const id = blendingId | cullId | depthTestId;
        return `${id}`;
    }

    @Attributes.enumLiterals(BlendingModes)
    private _blending = BlendingModes.None;

    @Attributes.enumLiterals(RenderPass)
    private _renderPass = RenderPass.Opaque;

    @Attributes.enumLiterals(CullModes)
    private _cullMode = CullModes.Back;
    private _depthTest = true;
    private _priority = 0;
    // Material is sensitive to serialization order,
    // first shader params must be set, then the shader so it decides which params to keep.
    private _shaderParams = new SerializableObject();
    private _shader = new AssetReference(Shader);

    constructor(props?: MaterialProps) {
        super();
        this.onShaderCodeChanged = this.onShaderCodeChanged.bind(this);
        this.onShaderChanged = this.onShaderChanged.bind(this);
        this._shader.assetChanged.attach(this.onShaderChanged);
        if (props) {
            if (Private.shaderParamsPropertySetter in props) {
                // if shaderParams appears in props, make sure they're applied after the shader
                const shaderParams = props[Private.shaderParamsPropertySetter];
                const { shader } = props;
                if (shader) {
                    delete props[Private.shaderParamsPropertySetter];
                    delete props.shader;
                    Object.assign(props, {
                        shader,
                        [Private.shaderParamsPropertySetter]: shaderParams
                    });
                }
            }
            this.setState(props as ObjectProps<Material>);
        }
    }

    begin() {
        let shader = this.shader;
        if (!shader || !shader.beginWithParams(this.shaderParams)) {
            return false;
        }
        this.uploadState();
        return true;
    }

    uploadState() {
        // blending
        let gl = WebGL.context;
        let blending = this.blending;
        if (blending === BlendingModes.None) {
            gl.disable(gl.BLEND);
        } else if (blending === BlendingModes.Linear) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else if (blending === BlendingModes.Additive) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        }

        // culling
        let cullMode = this.cullMode;
        if (cullMode === CullModes.Back) {
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
        } else if (cullMode === CullModes.Front) {
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.FRONT);
        } else {
            gl.disable(gl.CULL_FACE);
        }
    }

    destroy() {
        if (this._shader.asset) {
            this._shader.asset.codeChanged.detach(this.onShaderCodeChanged);
        }
        this._shader.detach();
        for (const param of Object.values(this._shaderParams)) {
            if (param.constructor.name === "AssetReference") {
                (param as AssetReference<Asset>).detach();
            }
        }
        super.destroy();
    }

    isLoaded() {
        if (!EngineUtils.isAssetRefLoaded(this._shader)) {
            return false;
        }
        return EngineUtils.isObjectLoaded(this._shaderParams);
    }

    // tslint:disable-next-line
    queueParameter(name: string, value: any) {
        this._shaderParams[name] = value;
    }

    queueReferenceParameter(name: string, referred: GraphicAsset) {
        const ref = this._shaderParams[name] as AssetReference<GraphicAsset>;
        if (ref) {
            ref.setAssetFast(referred);
        } else {
            Debug.logError("queueReferenceParameter failed");
        }
    }

    getParameter(name: string) {
        return this._shaderParams[name];
    }

    // tslint:disable-next-line
    applyParameter(name: string, value: any) {
        const shader = this.shader;
        if (!shader) {
            return;
        }
        this._shaderParams[name] = value;
        shader.applyParam(name, value);
    }

    applyReferenceParameter(name: string, referred: GraphicAsset) {
        const shader = this.shader;
        if (!shader) {
            return;
        }
        const ref = this._shaderParams[name] as AssetReference<GraphicAsset>;
        ref.setAssetFast(referred);
        shader.applyParam(name, ref);
    }

    upgrade(json: SerializedObject, previousVersion: number) {
        if (previousVersion === 1) {
            Object.assign(json.properties, {
                _blending: json.properties.blending,
                _renderPass: json.properties.renderPass,
                _cullMode: json.properties.cullMode,
                _priority: json.properties.priority,
                _shaderParams: json.properties.shaderParams,
                _shader: json.properties.shader
            });
            delete json.properties.blending;
            delete json.properties.renderPass;
            delete json.properties.cullMode;
            delete json.properties.priority;
            delete json.properties.shaderParams;
            delete json.properties.shader;

        } else if (previousVersion === 2) {
            // Convert TextureReference to AssetReference<Texture>
            // tslint:disable-next-line
            const { _shaderParams } = json.properties as any;
            for (const paramName of Object.keys(_shaderParams.properties)) {
                const param = _shaderParams.properties[paramName];
                if (param.typeName === "TextureReference") {
                    const textureRef = param.data.properties.texture;
                    _shaderParams.properties[paramName] = {
                        typeName: "AssetReference",
                        data: JSON.parse(JSON.stringify(textureRef))
                    };
                }
            }
        } else if (previousVersion === 3) {
            // Skybox render pass removed
            // tslint:disable-next-line
            let renderPass = json.properties._renderPass as any;
            if (typeof (renderPass) === "object") {
                renderPass = renderPass.value;
            }
            if (renderPass > 0) {
                Object.assign(json.properties, { _renderPass: renderPass - 1 });
            }
        }
        return json;
    }

    private onShaderCodeChanged(shaderId: string) {
        const shader = this.shader;
        if (!shader) {
            return;
        }
        this.updateParamsFromShader(shader, true);
        this.updateRuntimeAccessors();
    }

    private onShaderChanged(info: AssetChangedEvent) {
        if (process.env.CONFIG === "editor") {
            if (info.oldAsset) {
                (info.oldAsset as Shader).codeChanged.detach(this.onShaderCodeChanged);
            }
        }
        if (info.newAsset) {
            if (process.env.CONFIG === "editor") {
                // attach to new shader
                (info.newAsset as Shader).codeChanged.attach(this.onShaderCodeChanged);
            }
            this.updateParamsFromShader(info.newAsset as Shader, false);
            this.updateRuntimeAccessors();
        }
    }

    private updateRuntimeAccessors() {
        Object.entries(this._shaderParams).forEach(([paramName, param]) => {
            if (param.constructor.name === "AssetReference") {
                Object.defineProperty(this, paramName, {
                    get: () => (param as AssetReference<Asset>).asset,
                    set: value => {
                        (param as AssetReference<Asset>).asset = value as Asset;
                    },
                    configurable: true
                });
            } else {
                Object.defineProperty(this, paramName, {
                    get: () => this._shaderParams[paramName],
                    set: value => this._shaderParams[paramName] = value,
                    configurable: true
                });
            }
        });
    }

    private updateParamsFromShader(shader: Shader, liveCodeChange: boolean) {
        if (!shader.getUniforms()) {
            shader.initializeUniforms();
        }
        this._shaderParams = ShaderUtils.buildMaterialParams(shader.getUniforms(), this._shaderParams, liveCodeChange);
    }
}
