const jwt = require("jsonwebtoken");
require("dotenv").config();

function verificarToken(req, res, next) {
    const token = req.headers["authorization"];

    if (!token) {
        return res.status(403).json({ mensaje: "Token requerido" });
    }

    try {
        const tokenLimpio = token.replace("Bearer ", "");
        const decoded = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ mensaje: "Token inválido" });
    }
}

module.exports = verificarToken;
