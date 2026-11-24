// 全局环境参数：积雪覆盖、地面湿润。addSnow() 给任意 MeshStandardMaterial 叠加"朝上的面积雪 + 雨天变深"
export const envU = { uSnow: { value: 0 }, uWet: { value: 0 } }
let uid = 0
export function addSnow(mat, up = null) {
  const prev = mat.onBeforeCompile, id = ++uid
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r)
    sh.uniforms.uSnow = envU.uSnow; sh.uniforms.uWet = envU.uWet
    sh.vertexShader = 'varying vec3 vSnowW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 sW = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        sW = instanceMatrix * sW;
      #endif
      vSnowW = (modelMatrix * sW).xyz;`)
    sh.fragmentShader = 'uniform float uSnow, uWet;\nvarying vec3 vSnowW;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `
      {
        ${up === null ? 'vec3 sN = normalize(cross(dFdx(vSnowW), dFdy(vSnowW))); float sUp = abs(sN.y);' : `float sUp = ${up.toFixed(2)};`}
        float sNz = fract(sin(dot(floor(vSnowW.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
        float sK = uSnow * smoothstep(.45, .8, sUp + (sNz - .5) * .3 + (uSnow - .5) * .4);
        diffuseColor.rgb = mix(diffuseColor.rgb * (1. - uWet * .22), vec3(.84, .87, .93), sK);
      }
      #include <emissivemap_fragment>`)
  }
  mat.customProgramCacheKey = () => 'snow' + id   // 每个材质独立编译，避免同源 onBeforeCompile 共用程序
  return mat
}
