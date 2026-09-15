import { describe, expect, it } from "vitest";

import { parseSource } from "./parser.js";
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
});
