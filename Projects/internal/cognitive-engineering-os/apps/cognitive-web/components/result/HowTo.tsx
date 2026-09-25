import React from "react";

export function HowTo({ read, act }: { read: string; act: string }) { return <div className="how-to"><strong>怎麼讀：</strong> {read}<br /><strong>你要做的：</strong> {act}</div>; }
