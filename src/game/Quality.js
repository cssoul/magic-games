// 画质档位：触屏手机/平板用省电画质（较低分辨率、阴影、草地密度，关闭油画笔触滤镜）
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
export const LOW = TOUCH && Math.min(screen.width, screen.height) < 1000
