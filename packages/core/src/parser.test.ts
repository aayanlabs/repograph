import { describe, expect, it } from "vitest";

import { extractNamedImports, parseSource } from "./parser.js";
import type { RepositoryFile } from "./types.js";

function mockFile(path: string, language: RepositoryFile["language"]): RepositoryFile {
  return {
    path,
    absolutePath: `/app/${path}`,
    size: 100,
    modifiedTimeMs: Date.now(),
    hash: "mockhash",
    language,
    isBinary: false,
    isTooLarge: false,
  };
}

describe("parser", () => {
  it("parses TypeScript functions, classes, and interfaces", () => {
    const code = `
      export interface User {
        id: string;
        name: string;
      }

      export class BaseService {}

      export class UserService extends BaseService implements User {
        id = "1";
        name = "Alice";

        async getUser(id: string): Promise<User> {
          return { id, name: this.name };
        }
      }

      export function calculateTotal(items: number[]): number {
        return items.reduce((a, b) => a + b, 0);
      }
    `;

    const file = mockFile("src/user.ts", "typescript");
    const parsed = parseSource(file, code);

    expect(parsed.parseError).toBeNull();

    const names = parsed.symbols.map((s) => s.name);
    expect(names).toContain("User");
    expect(names).toContain("BaseService");
    expect(names).toContain("UserService");
    expect(names).toContain("calculateTotal");

    const userInterface = parsed.symbols.find((s) => s.name === "User");
    expect(userInterface?.kind).toBe("interface");

    const userService = parsed.symbols.find((s) => s.name === "UserService");
    expect(userService?.kind).toBe("class");

    const extendsEdge = parsed.edges.find((e) => e.kind === "extends");
    expect(extendsEdge).toBeDefined();

    const implementsEdge = parsed.edges.find((e) => e.kind === "implements");
    expect(implementsEdge).toBeDefined();
  });

  it("extracts imports and re-exports", () => {
    const code = `
      import { calculateTotal } from "./user.js";
      import defaultExport from "lodash";
      export { BaseService } from "./user.js";
    `;

    const file = mockFile("src/index.ts", "typescript");
    const parsed = parseSource(file, code);

    expect(parsed.imports).toHaveLength(2);
    const specifiers = parsed.imports.map((i) => i.specifier);
    expect(specifiers).toContain("./user.js");
    expect(specifiers).toContain("lodash");
  });

  it("parses TSX / JSX components", () => {
    const code = `
      import React from "react";

      export function HeaderProps() {
        return <h1>Title</h1>;
      }

      export const UserCard = () => {
        return <div>User</div>;
      };
    `;

    const file = mockFile("src/Header.tsx", "tsx");
    const parsed = parseSource(file, code);

    expect(parsed.parseError).toBeNull();
    const names = parsed.symbols.map((s) => s.name);
    expect(names).toContain("HeaderProps");
  });

  it("handles syntax errors gracefully", () => {
    const code = `
      function brokenSyntax( {
        const x = ;
    `;

    const file = mockFile("src/broken.ts", "typescript");
    const parsed = parseSource(file, code);

    expect(parsed.parseError).not.toBeNull();
  });

  it("parses Python files via regex fallback", () => {
    const code = `
import os
from sys import path

class Animal:
    def make_sound(self):
        pass

class Dog(Animal):
    def make_sound(self):
        print("Woof")

def fetch_data():
    return 42
`;

    const file = mockFile("main.py", "python");
    const parsed = parseSource(file, code);

    expect(parsed.parseError).toBeNull();
    const names = parsed.symbols.map((s) => s.name);
    expect(names).toContain("Animal");
    expect(names).toContain("Dog");
    expect(names).toContain("fetch_data");
    expect(parsed.imports.map((i) => i.specifier)).toContain("os");
    expect(parsed.imports.map((i) => i.specifier)).toContain("sys");

    const extendsEdge = parsed.edges.find((e) => e.kind === "extends");
    expect(extendsEdge).toBeDefined();
  });

  it("parses Go files via regex fallback", () => {
    const code = `
package main

import (
    "fmt"
    "net/http"
)

type Server struct {
    port int
}

type Handler interface {
    ServeHTTP()
}

func NewServer(port int) *Server {
    return &Server{port: port}
}

func (s *Server) Start() {
    fmt.Println("Starting")
}
`;

    const file = mockFile("main.go", "go");
    const parsed = parseSource(file, code);

    expect(parsed.parseError).toBeNull();
    const names = parsed.symbols.map((s) => s.name);
    expect(names).toContain("Server");
    expect(names).toContain("Handler");
    expect(names).toContain("NewServer");
    expect(names).toContain("Start");
    expect(parsed.imports.map((i) => i.specifier)).toContain("fmt");
    expect(parsed.imports.map((i) => i.specifier)).toContain("net/http");
  });

  describe("extractNamedImports", () => {
    it("extracts standard named imports", () => {
      const res = extractNamedImports('import { A, B } from "./module";', 1);
      expect(res).toHaveLength(2);
      expect(res[0]).toMatchObject({
        specifier: "./module",
        importedName: "A",
        localName: "A",
        isDefault: false,
      });
      expect(res[1]).toMatchObject({
        specifier: "./module",
        importedName: "B",
        localName: "B",
        isDefault: false,
      });
    });

    it("extracts default imports", () => {
      const res = extractNamedImports('import Foo from "./bar";', 2);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        specifier: "./bar",
        importedName: "default",
        localName: "Foo",
        isDefault: true,
      });
    });

    it("extracts namespace imports", () => {
      const res = extractNamedImports('import * as Utils from "./utils";', 3);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        specifier: "./utils",
        importedName: "*",
        localName: "Utils",
        isDefault: false,
      });
    });

    it("extracts aliased and type imports", () => {
      const aliased = extractNamedImports('import { A as B } from "./mod";', 4);
      expect(aliased).toHaveLength(1);
      expect(aliased[0]).toMatchObject({
        specifier: "./mod",
        importedName: "A",
        localName: "B",
      });

      const typeImp = extractNamedImports('import type { MyType } from "./types";', 5);
      expect(typeImp).toHaveLength(1);
      expect(typeImp[0]).toMatchObject({
        specifier: "./types",
        importedName: "MyType",
        localName: "MyType",
      });
    });

    it("extracts mixed default and named imports", () => {
      const res = extractNamedImports('import React, { useState, useEffect } from "react";', 6);
      const names = res.map((i) => i.localName);
      expect(names).toContain("useState");
      expect(names).toContain("useEffect");
    });
  });
});
