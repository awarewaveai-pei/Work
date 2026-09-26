import React from "react";

// A card's 怎麼讀／你要做的 strip, the mock's markup (docs/mockups design-system.css .how).
export function HowTo({ read, act }: { read: string; act: string }) { return <div className="how"><b>怎麼讀</b>{read}<b>你要做的</b>{act}</div>; }
