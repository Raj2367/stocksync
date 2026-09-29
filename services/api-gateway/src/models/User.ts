import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "ADMIN" | "USER";

export interface IUser extends Document {
  userId: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["ADMIN", "USER"],
      required: true,
      default: "USER",
    },
  },
  { timestamps: true },
);

export default mongoose.model<IUser>("User", UserSchema);
