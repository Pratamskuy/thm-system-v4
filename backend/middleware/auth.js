const jwt = require("jsonwebtoken");
require('dotenv').config();
const secretKey = process.env.JWT_SECRET;

const isAdmin =(req,res,next)=>{
    if(req.user && req.user.role_id === 1){
        next()
    }else{
        res.status(403).json({message:2})
    }
}
const isPetugas =(req,res,next)=>{
    if(req.user && req.user.role_id === 3){
        next()
    }else{
        res.status(403).json({message:"akses ditolak"})
    }
}
const isPeminjam =(req,res,next)=>{
    if(req.user && req.user.role_id === 'admin'){
        next()
    }else{
        res.status(403).json({message:"akses ditolak"})
    }
}


const authJWt = (req, res, next)=>{
    const token = req.header('Authorization')

    if (token){
        const auth = token.split(" ")[1]

        jwt.verify(auth, secretKey, (err, user)=>{
            if (err) {
                return res.sendStatus(403)
            }
            req.user = user
            next()
        })
    }else{
        res.sendStatus(401)
    }
}
module.exports={authJWt,isAdmin,isPetugas,isPeminjam}