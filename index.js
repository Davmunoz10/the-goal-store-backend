const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const pool = require('./db');
const verificarToken = require('./middleware/auth');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

//login
app.post('/auth/login', async (req, res) => {
    const { correo, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT u.id, u.nombre, u.correo, u.password, r.nombre AS rol
             FROM usuarios u
             INNER JOIN roles r ON u.rol_id = r.id
             WHERE u.correo = $1`,
            [correo]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: "Usuario no encontrado" });
        }

        const usuario = result.rows[0];

        const esPasswordCorrecto = await bcrypt.compare(password, usuario.password);
        if (!esPasswordCorrecto) {
            return res.status(401).json({ mensaje: "Credenciales incorrectas" });
        }

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: "4h" }
        );

        return res.json({
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                correo: usuario.correo,
                rol: usuario.rol
            }
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// crud productos
app.get('/productos', verificarToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM productos");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener productos" });
    }
});

app.post('/productos', verificarToken, async (req, res) => {
    const { nombre, precio } = req.body;

    try {
        const result = await pool.query(
            "INSERT INTO productos (nombre, precio) VALUES ($1, $2) RETURNING *",
            [nombre, precio]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al crear producto" });
    }
});

app.put('/productos/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { nombre, precio } = req.body;

    try {
        const result = await pool.query(
            "UPDATE productos SET nombre=$1, precio=$2 WHERE id=$3 RETURNING *",
            [nombre, precio, id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al actualizar producto" });
    }
});

app.delete('/productos/:id', verificarToken, async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM productos WHERE id=$1", [id]);

        res.json({ mensaje: "Producto eliminado" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al eliminar producto" });
    }
});

app.get('/admin/total-usuarios', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) AS total FROM usuarios`);
    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).json({ mensaje: "Error obteniendo total de usuarios" });
  }
});

// Total productos
app.get('/admin/total-productos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) AS total FROM productos`);
    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).json({ mensaje: "Error obteniendo total de productos" });
  }
});

// Total pedidos
app.get('/admin/total-pedidos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) AS total FROM boletas`);
    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).json({ mensaje: "Error obteniendo total de pedidos" });
  }
});

// Ventas mes
app.get('/admin/ventas-mes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total_mes
      FROM boletas
      WHERE DATE_PART('month', fecha) = DATE_PART('month', CURRENT_DATE)
      AND DATE_PART('year', fecha) = DATE_PART('year', CURRENT_DATE)
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).json({ mensaje: "Error obteniendo ventas del mes" });
  }
});

// crear boleta
app.post("/boletas", async (req, res) => {
  try {
    const { usuario_id, items } = req.body;

    if (!usuario_id || !items || items.length === 0) {
      return res.status(400).json({ mensaje: "Datos incompletos" });
    }

    let total = 0;

    items.forEach(item => {
      item.subtotal = item.precio * item.cantidad; 
      total += item.subtotal;
    });

    const boleta = await pool.query(
      "INSERT INTO boletas (usuario_id, total) VALUES ($1, $2) RETURNING id",
      [usuario_id, total]
    );

    const boleta_id = boleta.rows[0].id;

    for (const item of items) {
      await pool.query(
        `INSERT INTO detalle_boleta (boleta_id, producto_id, cantidad, subtotal)
         VALUES ($1, $2, $3, $4)`,
        [boleta_id, item.producto_id, item.cantidad, item.subtotal]
      );
    }

    res.json({
      mensaje: "Pedido creado correctamente",
      boleta_id,
      total
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ mensaje: "Error al crear el pedido" });
  }
});




// pedidos admin
app.get("/admin/pedidos", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id, b.fecha, b.total, u.nombre AS usuario
      FROM boletas b
      LEFT JOIN usuarios u ON b.usuario_id = u.id
      ORDER BY b.id DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al obtener pedidos" });
  }
});

// estadistica adminn
app.get("/admin/stats", async (req, res) => {
  try {
    const totalUsuarios = await pool.query(`SELECT COUNT(*) FROM usuarios`);
    const totalPedidos = await pool.query(`SELECT COUNT(*) FROM boletas`);
    const totalPendientes = await pool.query(`
      SELECT COUNT(*) 
      FROM boletas 
      WHERE fecha::date = CURRENT_DATE
    `);
    const ventasMes = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total 
      FROM boletas 
      WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    res.json({
      usuarios: totalUsuarios.rows[0].count,
      pedidos: totalPedidos.rows[0].count,
      pendientes: totalPendientes.rows[0].count,
      ventasMes: ventasMes.rows[0].total,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo estadísticas" });
  }
});

// servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
