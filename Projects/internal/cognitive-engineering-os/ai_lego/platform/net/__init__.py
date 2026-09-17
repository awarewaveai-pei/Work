"""Network seam shared by every outbound HTTP consumer (literature providers, AI gateway).

EC §99 deny-by-default lives here once; a module that opens its own socket without ``egress`` is a bug.
"""
