import { SaveProblems } from "@/components/admin/save-problems";
import { Badge, Button, ButtonLink, Card, DataTable, Message, PageHeader, Td, TextLink, Th } from "@/components/admin/ui/components";
import { FieldsPart } from "@/components/admin/ui/fields-gallery";
import { Part } from "@/components/admin/ui/gallery-part";
import { ERROR_CLASS, ROW_CLASS } from "@/components/admin/ui/styles";

const VARIANTS = ["primary", "save", "secondary", "quiet", "danger"] as const;

function ButtonsPart() {
  return (
    <Part id="buttons" title="Buttons">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <Button variant={variant}>{`Save ${variant}`}</Button>
          <Button variant={variant} disabled>
            {`Disabled ${variant}`}
          </Button>
          <Button variant={variant} busy>
            {`Busy ${variant}`}
          </Button>
          <ButtonLink href="/admin/design" variant={variant}>
            {`Link ${variant}`}
          </ButtonLink>
        </div>
      ))}
      <p>
        A <TextLink href="/admin/design">text link</TextLink> sits inside a sentence or alone on a line.
      </p>
    </Part>
  );
}

function CardsPart() {
  return (
    <Part id="cards" title="Page header, card, row and table">
      <Card>
        <PageHeader
          title="Page header"
          level={2}
          actions={
            <>
              <Button>Quiet action</Button>
              <Button variant="primary">Main action</Button>
            </>
          }
        />
        <p className="mt-2">A card holds one group of content.</p>
      </Card>
      <ul className="flex flex-col gap-3">
        <li className={ROW_CLASS}>
          <TextLink href="/admin/design">A list row</TextLink>
          <p className="flex flex-wrap items-center gap-2">
            A row has a link and a line of detail.
            <Badge>in use by 3</Badge>
            <Badge tone="private">private</Badge>
            <Badge tone="info">certain</Badge>
            <Badge tone="warning">uncertain</Badge>
          </p>
        </li>
      </ul>
      <DataTable label="Sample table">
        <caption className="sr-only">Sample table</caption>
        <thead>
          <tr>
            <Th scope="col">Name</Th>
            <Th scope="col">State</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>First row</Td>
            <Td>
              <Badge>in use by 2</Badge>
            </Td>
          </tr>
          <tr>
            <Td>Second row</Td>
            <Td>
              <Badge tone="private">private</Badge>
            </Td>
          </tr>
        </tbody>
      </DataTable>
    </Part>
  );
}

const SAMPLE_CONFLICT = {
  record: "show 12",
  expectedRev: 1,
  currentRev: 2,
  yours: [{ field: "Title", value: "Your title" }],
  stored: [{ field: "Title", value: "Stored title" }],
};

function MessagesPart() {
  return (
    <Part id="messages" title="Messages">
      <Message tone="success">Saved.</Message>
      <Message tone="info">A note about the page.</Message>
      <Message tone="error">The save was refused. Check the fields.</Message>
      <p className={ERROR_CLASS}>An error line below a field uses this style.</p>
      <SaveProblems messages={[]} conflicts={[SAMPLE_CONFLICT]} />
    </Part>
  );
}

/** The admin parts, each in its states. */
export function AdminPartsGallery() {
  return (
    <>
      <ButtonsPart />
      <FieldsPart />
      <CardsPart />
      <MessagesPart />
    </>
  );
}
