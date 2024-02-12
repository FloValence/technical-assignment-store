import {JSONArray, JSONObject, JSONPrimitive} from "./json-types";
import "reflect-metadata";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

const restrictMetadataKey = Symbol("Restrict");

export function Restrict(permissions: Permission = "none"): any {
  return Reflect.metadata(restrictMetadataKey, permissions);
}
export class Store implements IStore {
  defaultPolicy: Permission = "rw";

  allowedToRead(key: string): boolean {
    const permissions = getPermission(key, this);

    if (permissions === "r" || permissions === "rw") {
      return true;
    }

    if (permissions === "none") {
      return false;
    }

    if (this.defaultPolicy === "r" || this.defaultPolicy === "rw") {
      return true;
    }
    return false;
  }

  allowedToWrite(key: string): boolean {
    const parts = key.split(":");
    let perm = "";

    for (let part of parts) {
      const currentPermission = getPermission(part, this);
      if (!currentPermission) {
        return this.defaultPolicy === "w" || this.defaultPolicy === "rw";
      }
      perm = currentPermission;
    }

    const permissions = perm;
    return permissions === "w" || permissions === "rw";
  }

  read(path: string): StoreResult {
    if (!this.allowedToRead(path)) {
      throw new Error("Reading permission denied : " + path);
    }

    const keys = path.split(":");
    let value: StoreValue = this;
    for (let key of keys) {
      // @ts-ignore
      value = value[key];
      if (value === undefined) {
        throw new Error("Invalid path : " + path);
      }
    }

    return value as any;
  }

  write(path: string, value: StoreValue): StoreValue {
    if (!this.allowedToWrite(path)) {
      throw new Error("Writing permission denied : " + path);
    }

    const keys = path.split(":");

    this.writeHelper(keys, value, this);
    return value;
  }

  writeHelper(keys: string[], value: StoreValue, store: StoreValue): void {
    let key = keys.shift();
    if (keys.length === 0) {
      // @ts-ignore
      store[key] = value;
    } else {
      // @ts-ignore
      if (!store[key]) {
        // @ts-ignore
        store[key] = {};
      }
      // @ts-ignore
      this.writeHelper(keys, value, store[key]);
    }
  }

  writeEntries(entries: JSONObject): void {
    for (const key in entries) {
      if (entries.hasOwnProperty(key)) {
        this.write(key, entries[key]);
      }
    }
  }

  entries(): JSONObject {
    const validKeys = Object.getOwnPropertyNames(this).map((key) => {
      return this.allowedToRead(key) ? key : null;
    });

    const entries: Record<string, any> = {};

    validKeys.forEach((key) => {
      if (!key) return;
      const value = this.read(key);

      entries[key] = value;
    });

    return entries;
  }
}

const getPermission = (key: string, target: Store) => {
  return Reflect.getMetadata(restrictMetadataKey, target, key);
};
