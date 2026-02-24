import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

/** Extracts the visible text from a <pre> element. */
export function extractPreContent($: CheerioAPI, pre: Cheerio<Element>): string {
    let output = "";
    pre.contents().each((_, node) => {
        if (node.type === "text") {
            output += node.data;
        } else if (node.type === "tag") {
            if (node.name === "div") {
                output += $(node).text() + "\n";
            } else if (node.name === "br") {
                output += "\n";
            } else {
                // Ignore other tags
            }
        }
    });
    return output;
}