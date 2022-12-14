import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { join } from "path";
import { readFileSync } from "fs";

import { RegisterAttributes, tokenPayload } from "../../types/unAuth/user";
import User from "../../models/user";
import { generateToken, verifyToken } from "../../utils/jwt";
import { development } from "../../config";
import SendMail from "../../utils/mail";
import { JwtPayload } from "jsonwebtoken";

const router = express.Router();
const client = new OAuth2Client(process.env.CLIENT_ID);
const { clientId } = development;

router.post(
  "/login",
  async (req: Request<any, any, RegisterAttributes>, res: Response) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (user) {
        const hashedPassword = user.password;
        const compare = bcrypt.compareSync(password, hashedPassword);
        const token = generateToken(
          {
            email: email,
          },
          tokenPayload
        );
        const idToken = generateToken( user.toJSON(), tokenPayload);
        return compare && user.password
          ? res.status(200).json({ token: token, idToken })
          : res.status(500).json({ error: "Password doesnt match" });
      }
      return res.status(500).json({ error: "User doesnt exist." });
    } catch (error) {
      return res.status(500).json({ error: "An error Occured in Login" });
    }
  }
);

router.post(
  "/register",
  async (req: Request<any, any, RegisterAttributes>, res: Response) => {
    try {
      const { email, password } = req.body;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const userData = await User.findOneAndUpdate(
        {
          email: email,
        },
        {
          email,
          password: hashedPassword,
        },
        {
          upsert: true,
          new: true,
        }
      ).exec();
      const token = generateToken(
        {
          email: email,
        },
        tokenPayload
      );
      const idToken = generateToken( userData.toJSON(), tokenPayload);
      res.status(200).json({ token, idToken, message: "Registered User" });
    } catch (error) {
      res.status(500).json({ error });
    }
  }
);

router.post("/googleSignIn", async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (payload?.email) {
      const userData = await User.findOneAndUpdate(
        {
          email: payload.email,
        },
        {
          email: payload.email,
        },
        {
          upsert: true,
          new: true,
        }
      ).exec();
      const token = generateToken(
        {
          name: payload?.given_name,
          email: payload?.email,
        },
        tokenPayload
      );
      const idToken = generateToken(
        userData.toJSON(),
        tokenPayload
      );
      return res.status(200).json({ token, idToken, message: "Logged In" });
    }
    return res.status(500).json({ message: "Email signin failed" });
  } catch (error) {
    res.status(500).json({ error });
  }
});

router.post(
  "/forgotPassword",
  async (req: Request<any, any, { email: string }>, res: Response) => {
    try {
      const user = await User.findOne({ email: req.body.email });
      if (user) {
        const forgetPasswordString = readFileSync(
          join(__dirname, "..", "..", "templates", "forgotPassword.html")
        ).toString();
        const replacedString = forgetPasswordString.replace(
          "{{link}}",
          `<a href="http://localhost:3000/resetPassword/${user._id}">Reset password </a>`
        );
        await SendMail({
          to: req.body.email,
          subject: "Reset Password",
          html: replacedString,
        });
        return res.status(200).json({ message: "Send Email attempted" });
      }
      return res.status(500).json({ message: "User doesnt exit" });
    } catch (error) {
      return res.status(500).json({ message: "An error occured" });
    }
  }
);

router.post(
  "/resetPassword/",
  async (
    req: Request<any, any, { userId: string; password: string }>,
    res: Response
  ) => {
    try {
      const { userId, password } = req.body;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await User.findByIdAndUpdate(userId, {
        password: hashedPassword,
      });
      res
        .status(200)
        .json({ message: "Resetting password is successfully done" });
    } catch (error) {
      res.status(500).json({ error });
    }
  }
);

router.post(
  "/refreshToken",
  async (req: Request<any, any, { token: string }>, res: Response) => {
    try {
      const { token } = req.body;

      const verifiedToken = verifyToken(token, {
        issuer: "Jove",
        algorithms: ["RS256"],
      }) as JwtPayload;

      const refreshToken = generateToken(
        {
          email: verifiedToken["email"],
        },
        tokenPayload
      );

      res.status(200).json({ refreshToken: refreshToken });
    } catch (err) {
      res.status(500).json(err);
    }
  }
);

export { router as UserController };
