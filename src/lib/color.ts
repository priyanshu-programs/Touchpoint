// "#" and six hex digits, lower case: the one shape of colour this app stores and
// puts into a style. No names, no functions, nothing that could carry more CSS.
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

export const isHexColor = (value: string) => HEX_COLOR.test(value);
