// Ghost-to-Amber refractive transition field for the UWF spectral spark.
#ifdef GL_ES
precision mediump float;
#endif

uniform float u_overlay_ratio;
uniform float u_luma;
uniform float u_critical;
varying vec2 v_uv;

vec3 ghost_color() {
    return vec3(0.0, 0.94, 1.0);
}

vec3 amber_color() {
    return vec3(1.0, 0.72, 0.0);
}

vec3 critical_color() {
    return vec3(1.0, 0.0, 0.26);
}

void main() {
    float refract_band = smoothstep(0.0, 1.0, v_uv.y + sin(v_uv.x * 18.0) * 0.045);
    float ghost_to_amber = clamp((u_overlay_ratio - 0.40) / 0.15, 0.0, 1.0);
    vec3 spectral = mix(ghost_color(), amber_color(), ghost_to_amber);
    spectral = mix(spectral, critical_color(), clamp(u_critical, 0.0, 1.0));

    float shimmer = 0.42 + 0.58 * abs(sin(v_uv.y * 22.0 + u_luma * 6.28318));
    float alpha = mix(0.15, 1.0, ghost_to_amber) * shimmer;
    if (u_critical > 0.5) {
        alpha = 0.86 + 0.14 * abs(sin(v_uv.y * 6.28318));
    }

    gl_FragColor = vec4(spectral * refract_band * (0.72 + u_luma * 0.28), alpha);
}
