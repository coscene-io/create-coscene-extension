# topic-aliasing-extension

This is an example of a coScene [topic alias extension](https://docs.coscene.cn/docs/viz/extensions/introduction). Topic alias extensions
dynamically alias data source topics to topics with new names of your choosing.

This example automatically remaps all topics as well as remapping a specific topic
selected by the user by setting the `camera` global variable.

## Develop

Extension development uses the `npm` package manager to install development dependencies
and run build scripts.

To install extension dependencies, run `npm` from the root of the extension package.

```sh
npm install
```

To build and install the extension into your local coStudio, run:

```sh
npm run local-install
```

Open the coStudio (or `ctrl-R` to refresh if it is already open). Your
extension is installed and available within the app.

## Package

Extensions are packaged into `.coe` files. These files contain the metadata
(package.json) and the build code for the extension.

Before packaging, make sure to set `name`, `publisher`, `version`, and `description`
fields in _package.json_. When ready to distribute the extension, run:

```sh
npm run package
```

This command will package the extension into a `.coe` file in the local directory.
